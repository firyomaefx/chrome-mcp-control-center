import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export type SafetyMode = "read_only" | "ask_before_actions" | "allow_low_risk";
export type PermissionMode = SafetyMode;

export interface LlmConnection {
  id: string;
  name: string;
  provider: "grok" | "claude" | "codex" | "generic" | "local";
  tokenHash: string;
  /** plaintext token only stored once at creation for copy UI; optional after */
  tokenHint?: string;
  scopes: string[];
  createdAt: string;
  lastSeenAt?: string;
  revoked: boolean;
}

export interface AppConfig {
  version: number;
  wizardCompleted: boolean;
  safetyMode: SafetyMode;
  permissionMode: PermissionMode;
  extensionId: string;
  allowedDomains: string[];
  blockedDomains: string[];
  alwaysAllowLowRisk: boolean;
  computerUseEnabled: boolean;
  startWithWindows: boolean;
  startMinimized: boolean;
  autoRecovery: boolean;
  updateChannel: "stable" | "beta";
  logRetentionDays: number;
  screenshotRetentionDays: number;
  defaultLlm?: string;
  httpPort: number;
  httpEnabled: boolean;
  connections: LlmConnection[];
  approvedUploadDirs: string[];
  approvedDownloadDirs: string[];
  emergencyStop: boolean;
  paused: boolean;
  /** free | paid — cloud sync scope */
  plan: "free" | "paid";
  /** Owner cloud ingest URL (HTTPS except loopback) */
  cloudUrl?: string;
  /** Screenshots to cloud only when paid + enabled */
  cloudScreenshotsEnabled: boolean;
  /** Files to cloud only when paid + explicit */
  cloudFilesEnabled: boolean;
}

const CONFIG_VERSION = 1;

export function defaultDataDir(): string {
  if (process.env.CHROME_MCP_DATA_DIR) return process.env.CHROME_MCP_DATA_DIR;
  return path.join(os.homedir(), "AppData", "Roaming", "Chrome MCP Control Center", "data");
}

export function ensureDataDirs(dataDir: string): void {
  for (const sub of [
    "",
    "logs",
    "screenshots",
    "workflows",
    "profiles",
    "pairings",
    "tmp",
    "local-history",
    "sync-queue",
  ]) {
    const p = path.join(dataDir, sub);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }
}

export function configPath(dataDir: string): string {
  return path.join(dataDir, "config.json");
}

export function defaultConfig(): AppConfig {
  const home = os.homedir();
  return {
    version: CONFIG_VERSION,
    wizardCompleted: false,
    safetyMode: "ask_before_actions",
    permissionMode: "ask_before_actions",
    extensionId: process.env.CHROME_MCP_EXTENSION_ID || "",
    allowedDomains: ["*"],
    blockedDomains: [],
    alwaysAllowLowRisk: false,
    computerUseEnabled: false,
    startWithWindows: false,
    startMinimized: false,
    autoRecovery: true,
    updateChannel: "stable",
    logRetentionDays: 30,
    screenshotRetentionDays: 7,
    httpPort: Number(process.env.CHROME_MCP_HTTP_PORT || 18787),
    httpEnabled: true,
    connections: [],
    approvedUploadDirs: [path.join(home, "Documents"), path.join(home, "Downloads")],
    approvedDownloadDirs: [path.join(home, "Downloads", "ChromeMCP")],
    emergencyStop: false,
    paused: false,
    plan: (process.env.CHROME_MCP_PLAN as "free" | "paid") || "free",
    cloudUrl: process.env.CHROME_MCP_CLOUD_URL || "http://127.0.0.1:8788/v1/ingest",
    cloudScreenshotsEnabled: false,
    cloudFilesEnabled: false,
  };
}

export function loadConfig(dataDir: string): AppConfig {
  ensureDataDirs(dataDir);
  const p = configPath(dataDir);
  if (!fs.existsSync(p)) {
    const cfg = defaultConfig();
    saveConfig(dataDir, cfg);
    return cfg;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<AppConfig>;
    return { ...defaultConfig(), ...raw, version: CONFIG_VERSION };
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(dataDir: string, cfg: AppConfig): void {
  ensureDataDirs(dataDir);
  fs.writeFileSync(configPath(dataDir), JSON.stringify(cfg, null, 2), "utf8");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function createConnection(
  cfg: AppConfig,
  name: string,
  provider: LlmConnection["provider"],
): { config: AppConfig; token: string; connection: LlmConnection } {
  const token = generateToken();
  const connection: LlmConnection = {
    id: crypto.randomUUID(),
    name,
    provider,
    tokenHash: hashToken(token),
    tokenHint: token.slice(0, 6) + "…",
    scopes: ["browser", "system"],
    createdAt: new Date().toISOString(),
    revoked: false,
  };
  const next = { ...cfg, connections: [...cfg.connections, connection] };
  return { config: next, token, connection };
}

export function authenticateToken(cfg: AppConfig, token: string | undefined): LlmConnection | null {
  if (!token) {
    // Dev convenience: if no connections exist yet, allow local unauthenticated stdio.
    if (cfg.connections.length === 0) return null;
    return null;
  }
  const h = hashToken(token);
  const found = cfg.connections.find((c) => !c.revoked && c.tokenHash === h);
  return found ?? null;
}
