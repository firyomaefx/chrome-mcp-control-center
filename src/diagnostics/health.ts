import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig } from "../config.js";
import { isNativeHostRegistered, findChromePath } from "./windows.js";
import { getBridgeStatus } from "../browser/bridge.js";

export interface HealthReport {
  ok: boolean;
  time: string;
  primaryFailure?: string;
  repairAction?: string;
  chrome: { ok: boolean; found: boolean; path?: string; version?: string };
  extension: { installed: boolean; connected: boolean; extensionId?: string };
  nativeHost: { registered: boolean; manifestPath?: string };
  mcp: { ok: boolean };
  llm: { paired: boolean; count: number };
  ports: { httpPort: number; conflict: boolean };
  disk: { ok: boolean; dataDir: string };
  versions: { app: string; node: string; platform: string };
  components: Record<string, "pass" | "fail" | "warn">;
}

export async function runHealthCheck(
  dataDir: string,
  opts: { mockBridge?: boolean } = {},
): Promise<HealthReport> {
  const cfg = loadConfig(dataDir);
  const chromePath = findChromePath();
  const chromeFound = Boolean(chromePath);
  const nm = isNativeHostRegistered();
  const bridge = opts.mockBridge
    ? { connected: true, lastSeen: new Date().toISOString(), mock: true, extensionId: "mock" }
    : getBridgeStatus();

  const paired = cfg.connections.some((c) => !c.revoked);
  const components: HealthReport["components"] = {
    disk: "pass",
    chrome: chromeFound || opts.mockBridge ? "pass" : "fail",
    // HTTP bridge is the primary control plane; NM is secondary
    nativeHost: nm.registered || opts.mockBridge || bridge.connected ? "pass" : "warn",
    extension: bridge.connected || opts.mockBridge ? "pass" : "fail",
    llm: paired ? "pass" : "warn",
    mcp: "pass",
  };

  let primaryFailure: string | undefined;
  let repairAction: string | undefined;
  if (!chromeFound && !opts.mockBridge) {
    primaryFailure = "Chrome not found";
    repairAction = "Install Google Chrome, then click Start All";
    components.chrome = "fail";
  } else if (!bridge.connected && !opts.mockBridge) {
    primaryFailure = "Extension not connected";
    repairAction =
      "Click Connect Chrome or Start All — Chrome will relaunch once with the extension loaded";
    components.extension = "fail";
  } else if (!nm.registered && !opts.mockBridge && bridge.connected) {
    // Soft: connected over HTTP is enough for Ready
    components.nativeHost = "warn";
  }

  // Ready: Chrome present + extension HTTP connected (NM optional when HTTP works)
  const ok =
    opts.mockBridge ||
    (chromeFound && bridge.connected && !cfg.emergencyStop);

  return {
    ok,
    time: new Date().toISOString(),
    primaryFailure,
    repairAction,
    chrome: { ok: chromeFound || !!opts.mockBridge, found: chromeFound, path: chromePath },
    extension: {
      installed: Boolean(cfg.extensionId) || bridge.connected || fs.existsSync(path.join(dataDir, "extension", "manifest.json")),
      connected: bridge.connected || !!opts.mockBridge,
      extensionId: bridge.extensionId || cfg.extensionId || undefined,
    },
    nativeHost: { registered: nm.registered || !!opts.mockBridge, manifestPath: nm.manifestPath },
    mcp: { ok: true },
    llm: { paired, count: cfg.connections.filter((c) => !c.revoked).length },
    ports: { httpPort: cfg.httpPort, conflict: false },
    disk: { ok: fs.existsSync(dataDir), dataDir },
    versions: {
      app: "1.0.2",
      node: process.version,
      platform: `${os.platform()} ${os.release()}`,
    },
    components,
  };
}

export function writeDiagnosticReport(dataDir: string, report: HealthReport): string {
  const out = path.join(dataDir, "logs", `diagnostic-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  return out;
}
