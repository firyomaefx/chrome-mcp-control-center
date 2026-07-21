/**
 * Telemetry facade: local history first, then sync queue.
 * Free = operational metrics only; Paid = ops + extended history kinds.
 */

import crypto from "node:crypto";
import { LocalCloudStore } from "./local-store.js";
import { loadOrCreateIdentity, osVersionString, setPlan } from "./identity.js";
import {
  domainFromUrl,
  normalizeObjective,
  sanitizeForCloud,
} from "./redact-payload.js";
import {
  CONSENT_VERSION,
  MCP_APP_VERSION,
  PAID_ONLY_KINDS,
  type FreeOpsEnvelope,
  type PlanTier,
  type SyncRecordKind,
} from "./types.js";
import { SyncClient } from "./sync-client.js";

export class TelemetryService {
  private store: LocalCloudStore;
  private sync: SyncClient;
  private flushTimer?: ReturnType<typeof setInterval>;

  constructor(private dataDir: string) {
    this.store = new LocalCloudStore(dataDir);
    this.sync = new SyncClient(dataDir, this.store);
  }

  startBackgroundFlush(intervalMs = 60_000): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.sync.flush().catch(() => {});
    }, intervalMs);
    // unref so process can exit
    if (typeof this.flushTimer === "object" && "unref" in this.flushTimer) {
      (this.flushTimer as NodeJS.Timeout).unref();
    }
  }

  stopBackgroundFlush(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = undefined;
  }

  getStore(): LocalCloudStore {
    return this.store;
  }

  getSync(): SyncClient {
    return this.sync;
  }

  hasConsent(): boolean {
    const c = this.store.getConsent();
    return c.accepted === true && c.version === CONSENT_VERSION;
  }

  acceptConsent(plan: PlanTier = "free", contactEmail?: string): void {
    this.store.setConsent({
      accepted: true,
      acceptedAt: new Date().toISOString(),
      version: CONSENT_VERSION,
      plan,
      contactEmail,
    });
    setPlan(this.dataDir, plan);
  }

  private baseEnvelope(
    kind: SyncRecordKind,
    payload: Record<string, unknown>,
    extra: Partial<FreeOpsEnvelope> = {},
  ): FreeOpsEnvelope | null {
    if (!this.hasConsent()) return null;
    const identity = loadOrCreateIdentity(this.dataDir);
    // Plan gate for paid-only
    if (PAID_ONLY_KINDS.has(kind) && identity.plan !== "paid") {
      return null;
    }
    const clientEventId = crypto.randomUUID();
    return {
      recordId: crypto.randomUUID(),
      clientEventId,
      userId: identity.userId,
      deviceId: identity.deviceId,
      plan: identity.plan,
      kind,
      createdAt: new Date().toISOString(),
      chromeVersion: process.env.CHROME_MCP_CHROME_VERSION,
      mcpVersion: MCP_APP_VERSION,
      osVersion: osVersionString(),
      appVersion: MCP_APP_VERSION,
      payload: sanitizeForCloud(payload) as Record<string, unknown>,
      ...extra,
      websiteDomain: extra.websiteDomain
        ? extra.websiteDomain
        : domainFromUrl(typeof payload.url === "string" ? payload.url : undefined),
    };
  }

  emit(
    kind: SyncRecordKind,
    payload: Record<string, unknown>,
    extra: Partial<FreeOpsEnvelope> = {},
  ): void {
    try {
      const rec = this.baseEnvelope(kind, payload, extra);
      if (!rec) return;
      this.store.appendLocalAndEnqueue(rec);
    } catch {
      /* never break product on telemetry */
    }
  }

  /** Free + Paid: task prompts / objectives */
  trackTaskPrompt(prompt: string, meta: Record<string, unknown> = {}): void {
    this.emit("task_prompt", {
      prompt: sanitizeForCloud(prompt),
      objective: normalizeObjective(prompt),
      ...meta,
    });
    this.emit("task_objective", { objective: normalizeObjective(prompt), ...meta });
  }

  trackToolCall(tool: string, args: unknown, result: unknown, ok: boolean, durationMs: number): void {
    this.emit(ok ? "tool_call" : "failed_action", {
      tool,
      args: sanitizeForCloud(args),
      resultSummary: summarizeResult(result),
      ok,
      durationMs,
    });
    if (!ok) {
      this.emit("automation_error", {
        tool,
        error: extractError(result),
        durationMs,
      });
    }
  }

  trackBrowserAction(action: string, ok: boolean, detail: Record<string, unknown> = {}): void {
    this.emit(ok ? "browser_action" : "failed_action", {
      action,
      ok,
      ...detail,
    });
  }

  trackConsoleError(message: string, domain?: string): void {
    this.emit("console_error", { message: sanitizeForCloud(message) }, { websiteDomain: domain });
  }

  trackNetworkError(message: string, domain?: string): void {
    this.emit("network_error", { message: sanitizeForCloud(message) }, { websiteDomain: domain });
  }

  trackRecovery(attempt: number, strategy: string, success: boolean, detail: Record<string, unknown> = {}): void {
    this.emit("recovery_attempt", { attempt, strategy, ...detail });
    this.emit("recovery_result", { attempt, strategy, success, ...detail });
  }

  trackTaskResult(ok: boolean, durationMs: number, detail: Record<string, unknown> = {}): void {
    this.emit("task_result", { ok, durationMs, ...detail });
  }

  trackCrash(message: string, stack?: string): void {
    this.emit("crash_report", {
      message: sanitizeForCloud(message),
      stack: stack ? String(sanitizeForCloud(stack)).slice(0, 2000) : undefined,
    });
  }

  trackAppRestart(reason: string): void {
    this.emit("app_restart", { reason });
  }

  trackUsage(metric: string, value: number, tags: Record<string, unknown> = {}): void {
    this.emit("usage_metric", { metric, value, ...tags });
  }

  /** Paid */
  trackAiResponse(model: string, response: string, meta: Record<string, unknown> = {}): void {
    this.emit(
      "ai_response",
      { model, response: sanitizeForCloud(response), ...meta },
      { aiModel: model },
    );
  }

  status() {
    return {
      consent: this.store.getConsent(),
      sync: this.store.refreshCounts(),
      identity: (() => {
        const id = loadOrCreateIdentity(this.dataDir);
        return { userId: id.userId, deviceId: id.deviceId, plan: id.plan };
      })(),
    };
  }
}

function summarizeResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return sanitizeForCloud(result);
  const r = result as Record<string, unknown>;
  return sanitizeForCloud({
    ok: r.ok,
    method: r.method,
    error: r.error,
    durationMs: r.durationMs,
  });
}

function extractError(result: unknown): unknown {
  if (result && typeof result === "object" && "error" in result) {
    return sanitizeForCloud((result as { error: unknown }).error);
  }
  return undefined;
}

// Singleton helper for process
let singleton: TelemetryService | null = null;

export function getTelemetry(dataDir: string): TelemetryService {
  if (!singleton || (singleton as unknown as { dataDir: string }).dataDir !== dataDir) {
    singleton = new TelemetryService(dataDir);
    (singleton as unknown as { dataDir: string }).dataDir = dataDir;
    singleton.startBackgroundFlush();
  }
  return singleton;
}
