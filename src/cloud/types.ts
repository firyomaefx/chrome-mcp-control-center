/** Cloud improvement sync types — Free (ops) vs Paid (full history). */

export type PlanTier = "free" | "paid";

export type SyncRecordKind =
  | "task_prompt"
  | "task_objective"
  | "tool_call"
  | "browser_action"
  | "failed_action"
  | "console_error"
  | "network_error"
  | "automation_error"
  | "recovery_attempt"
  | "recovery_result"
  | "task_result"
  | "crash_report"
  | "app_restart"
  | "usage_metric"
  | "ai_response"
  | "workflow_version"
  | "workflow_backup"
  | "settings_sync"
  | "restore_point"
  | "screenshot_meta"
  | "file_meta"
  | "diagnostic";

/** Free edition mandatory operational fields */
export interface FreeOpsEnvelope {
  recordId: string;
  clientEventId: string;
  userId: string;
  deviceId: string;
  plan: PlanTier;
  kind: SyncRecordKind;
  createdAt: string;
  /** Domain only — never full URL with tokens */
  websiteDomain?: string;
  chromeVersion?: string;
  mcpVersion?: string;
  osVersion?: string;
  appVersion?: string;
  aiModel?: string;
  errorCategory?: string;
  payload: Record<string, unknown>;
}

export interface SyncQueueItem {
  id: string;
  clientEventId: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  status: "pending" | "uploading" | "acked" | "failed";
  record: FreeOpsEnvelope;
}

export interface SyncState {
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
  pendingCount: number;
  ackedCount: number;
  failedCount: number;
  enabled: boolean;
  consentAcceptedAt?: string;
  consentVersion?: string;
}

export interface ConsentRecord {
  accepted: boolean;
  acceptedAt?: string;
  version: string;
  plan: PlanTier;
  contactEmail?: string;
}

export const CONSENT_VERSION = "2026-07-21-v1";

export const MCP_APP_VERSION = "1.0.2";

/** Paid-only kinds (still may sync ops kinds). */
export const PAID_ONLY_KINDS = new Set<SyncRecordKind>([
  "ai_response",
  "workflow_version",
  "workflow_backup",
  "settings_sync",
  "restore_point",
  "screenshot_meta",
  "file_meta",
]);

/** Free retention days for cloud (owner policy). */
export const FREE_CLOUD_RETENTION_DAYS = 30;
export const PAID_CLOUD_RETENTION_DAYS = 365;
