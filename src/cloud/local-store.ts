/**
 * Local-first storage: history + sync queue (JSONL, no native SQLite dependency).
 * Free & Paid both keep local history, screenshots, workflows, rollback under data/.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { FreeOpsEnvelope, SyncQueueItem, SyncState, ConsentRecord } from "./types.js";
import { CONSENT_VERSION } from "./types.js";

function ensure(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export class LocalCloudStore {
  private historyDir: string;
  private queueDir: string;
  private statePath: string;
  private consentPath: string;
  private seenPath: string;
  private seen: Set<string>;

  constructor(private dataDir: string) {
    this.historyDir = path.join(dataDir, "local-history");
    this.queueDir = path.join(dataDir, "sync-queue");
    this.statePath = path.join(dataDir, "sync-state.json");
    this.consentPath = path.join(dataDir, "consent.json");
    this.seenPath = path.join(dataDir, "sync-seen.json");
    ensure(this.historyDir);
    ensure(this.queueDir);
    this.seen = this.loadSeen();
  }

  private loadSeen(): Set<string> {
    try {
      if (fs.existsSync(this.seenPath)) {
        const arr = JSON.parse(fs.readFileSync(this.seenPath, "utf8")) as string[];
        return new Set(arr.slice(-50000));
      }
    } catch {
      /* ignore */
    }
    return new Set();
  }

  private saveSeen(): void {
    fs.writeFileSync(this.seenPath, JSON.stringify([...this.seen].slice(-50000)), "utf8");
  }

  getConsent(): ConsentRecord {
    try {
      if (fs.existsSync(this.consentPath)) {
        return JSON.parse(fs.readFileSync(this.consentPath, "utf8")) as ConsentRecord;
      }
    } catch {
      /* ignore */
    }
    return { accepted: false, version: CONSENT_VERSION, plan: "free" };
  }

  setConsent(c: ConsentRecord): void {
    fs.writeFileSync(this.consentPath, JSON.stringify(c, null, 2), "utf8");
  }

  getState(): SyncState {
    try {
      if (fs.existsSync(this.statePath)) {
        return JSON.parse(fs.readFileSync(this.statePath, "utf8")) as SyncState;
      }
    } catch {
      /* ignore */
    }
    return {
      pendingCount: 0,
      ackedCount: 0,
      failedCount: 0,
      enabled: true,
    };
  }

  private writeState(s: SyncState): void {
    fs.writeFileSync(this.statePath, JSON.stringify(s, null, 2), "utf8");
  }

  refreshCounts(): SyncState {
    const pending = this.listQueue().filter((q) => q.status === "pending" || q.status === "failed");
    const s = this.getState();
    s.pendingCount = pending.length;
    this.writeState(s);
    return s;
  }

  /** Save locally first, then enqueue for cloud (dedupe by clientEventId). */
  appendLocalAndEnqueue(record: FreeOpsEnvelope): { queued: boolean; duplicate: boolean } {
    if (this.seen.has(record.clientEventId)) {
      return { queued: false, duplicate: true };
    }
    this.seen.add(record.clientEventId);
    this.saveSeen();

    // Local history (always)
    const day = record.createdAt.slice(0, 10);
    const histFile = path.join(this.historyDir, `history-${day}.jsonl`);
    fs.appendFileSync(histFile, JSON.stringify(record) + "\n", "utf8");

    // Sync queue
    const item: SyncQueueItem = {
      id: crypto.randomUUID(),
      clientEventId: record.clientEventId,
      createdAt: record.createdAt,
      attempts: 0,
      status: "pending",
      record,
    };
    fs.writeFileSync(path.join(this.queueDir, `${item.id}.json`), JSON.stringify(item, null, 2), "utf8");
    this.refreshCounts();
    return { queued: true, duplicate: false };
  }

  listQueue(limit = 100): SyncQueueItem[] {
    if (!fs.existsSync(this.queueDir)) return [];
    const files = fs.readdirSync(this.queueDir).filter((f) => f.endsWith(".json")).sort();
    const out: SyncQueueItem[] = [];
    for (const f of files) {
      try {
        out.push(JSON.parse(fs.readFileSync(path.join(this.queueDir, f), "utf8")) as SyncQueueItem);
      } catch {
        /* skip */
      }
      if (out.length >= limit) break;
    }
    return out;
  }

  updateQueueItem(item: SyncQueueItem): void {
    fs.writeFileSync(path.join(this.queueDir, `${item.id}.json`), JSON.stringify(item, null, 2), "utf8");
  }

  removeQueueItem(id: string): void {
    const p = path.join(this.queueDir, `${id}.json`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  markSuccess(): void {
    const s = this.getState();
    s.lastSuccessAt = new Date().toISOString();
    s.lastAttemptAt = s.lastSuccessAt;
    s.lastError = undefined;
    s.ackedCount = (s.ackedCount || 0) + 1;
    this.writeState(s);
    this.refreshCounts();
  }

  markAttemptError(err: string): void {
    const s = this.getState();
    s.lastAttemptAt = new Date().toISOString();
    s.lastError = err;
    s.failedCount = (s.failedCount || 0) + 1;
    this.writeState(s);
  }

  readHistory(limit = 200): FreeOpsEnvelope[] {
    if (!fs.existsSync(this.historyDir)) return [];
    const files = fs
      .readdirSync(this.historyDir)
      .filter((f) => f.startsWith("history-") && f.endsWith(".jsonl"))
      .sort()
      .reverse();
    const out: FreeOpsEnvelope[] = [];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(this.historyDir, f), "utf8").split("\n").filter(Boolean).reverse();
      for (const line of lines) {
        try {
          out.push(JSON.parse(line) as FreeOpsEnvelope);
        } catch {
          /* skip */
        }
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  /** Local wipe of queue + history (user deletion request local side). */
  wipeLocalSyncData(): void {
    for (const dir of [this.historyDir, this.queueDir]) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        fs.unlinkSync(path.join(dir, f));
      }
    }
    this.seen.clear();
    this.saveSeen();
    this.writeState({
      pendingCount: 0,
      ackedCount: 0,
      failedCount: 0,
      enabled: true,
      lastSuccessAt: undefined,
      lastError: undefined,
    });
  }
}
