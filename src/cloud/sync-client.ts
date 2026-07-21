/**
 * Cloud sync client: HTTPS upload, retry, dedupe (clientEventId).
 */

import https from "node:https";
import http from "node:http";
import { URL } from "node:url";
import type { LocalCloudStore } from "./local-store.js";
import { loadOrCreateIdentity } from "./identity.js";
import type { FreeOpsEnvelope } from "./types.js";

export interface SyncFlushResult {
  uploaded: number;
  failed: number;
  skipped: number;
  lastError?: string;
}

export class SyncClient {
  constructor(
    private dataDir: string,
    private store: LocalCloudStore,
  ) {}

  /** Cloud ingest base URL — default owner backend or env override. */
  endpoint(): string {
    return (
      process.env.CHROME_MCP_CLOUD_URL ||
      process.env.CHROME_MCP_SYNC_URL ||
      "https://cloud.chromemcp.local/v1/ingest"
    );
  }

  async flush(batchSize = 25): Promise<SyncFlushResult> {
    const consent = this.store.getConsent();
    if (!consent.accepted) {
      return { uploaded: 0, failed: 0, skipped: 0, lastError: "consent_required" };
    }

    const identity = loadOrCreateIdentity(this.dataDir);
    const pending = this.store
      .listQueue(batchSize * 2)
      .filter((q) => q.status === "pending" || q.status === "failed")
      .slice(0, batchSize);

    if (pending.length === 0) {
      return { uploaded: 0, failed: 0, skipped: 0 };
    }

    // Offline / bad endpoint: still local-first
    const url = this.endpoint();
    let uploaded = 0;
    let failed = 0;
    let lastError: string | undefined;

    // Batch upload
    const records = pending.map((p) => p.record);
    try {
      await this.postIngest(url, identity.deviceKey, identity.userId, records);
      for (const item of pending) {
        item.status = "acked";
        this.store.removeQueueItem(item.id);
        uploaded++;
      }
      this.store.markSuccess();
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      for (const item of pending) {
        item.attempts += 1;
        item.lastAttemptAt = new Date().toISOString();
        item.lastError = lastError;
        item.status = item.attempts >= 8 ? "failed" : "pending";
        this.store.updateQueueItem(item);
        failed++;
      }
      this.store.markAttemptError(lastError);
    }

    this.store.refreshCounts();
    return { uploaded, failed, skipped: 0, lastError };
  }

  private postIngest(
    endpoint: string,
    deviceKey: string,
    userId: string,
    records: FreeOpsEnvelope[],
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let parsed: URL;
      try {
        parsed = new URL(endpoint);
      } catch {
        reject(new Error(`Invalid cloud URL: ${endpoint}`));
        return;
      }

      // Allow http only for loopback owner backends
      const isLoopback =
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "localhost" ||
        parsed.hostname.endsWith(".local");
      if (parsed.protocol === "http:" && !isLoopback) {
        reject(new Error("Cloud sync requires HTTPS except for loopback"));
        return;
      }

      const body = JSON.stringify({
        userId,
        records,
        clientTime: new Date().toISOString(),
      });
      const lib = parsed.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            Authorization: `Bearer ${deviceKey}`,
            "X-Chrome-MCP-User": userId,
            "User-Agent": "ChromeMCP-Sync/1.0",
          },
          timeout: 20000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(
                new Error(
                  `ingest HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString("utf8").slice(0, 200)}`,
                ),
              );
            }
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("ingest timeout"));
      });
      req.write(body);
      req.end();
    });
  }

  async deleteCloudAccount(): Promise<{ ok: boolean; error?: string }> {
    const identity = loadOrCreateIdentity(this.dataDir);
    const base = this.endpoint().replace(/\/v1\/ingest\/?$/, "");
    const url = `${base}/v1/user/data`;
    try {
      await this.requestJson(url, "DELETE", identity.deviceKey, identity.userId, {});
      this.store.wipeLocalSyncData();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private requestJson(
    endpoint: string,
    method: string,
    deviceKey: string,
    userId: string,
    bodyObj: unknown,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(endpoint);
      const body = method === "GET" || method === "DELETE" ? "" : JSON.stringify(bodyObj);
      const lib = parsed.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${deviceKey}`,
            "X-Chrome-MCP-User": userId,
            ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
          },
          timeout: 20000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(text ? JSON.parse(text) : {});
              } catch {
                resolve({});
              }
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
            }
          });
        },
      );
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  }
}
