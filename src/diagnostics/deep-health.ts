/**
 * Deep health matrix for multi-PC reliability.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig } from "../config.js";
import { findChromePath, isNativeHostRegistered } from "./windows.js";
import { getBridgeStatus } from "../browser/bridge.js";
import { canBind } from "./ports.js";
import { detectForeignOrStale } from "./machine-profile.js";
import { LocalCloudStore } from "../cloud/local-store.js";
import { MCP_APP_VERSION } from "../cloud/types.js";

export type CheckStatus = "pass" | "warn" | "fail";

export interface HealthCheckItem {
  id: string;
  status: CheckStatus;
  message: string;
  repairAction?: string;
  autoFixable: boolean;
}

export interface DeepHealthReport {
  ok: boolean;
  time: string;
  primaryFailure?: string;
  repairAction?: string;
  foreignMachine: boolean;
  foreignReasons: string[];
  checks: HealthCheckItem[];
  chrome: { found: boolean; path?: string };
  extension: { connected: boolean; extensionId?: string; staged: boolean };
  nativeHost: { registered: boolean; manifestPath?: string };
  ports: { httpPort: number; conflict: boolean };
  consent: { accepted: boolean };
  cloud: { reachable: boolean | null; url?: string };
  versions: { app: string; node: string; platform: string };
  components: Record<string, CheckStatus>;
}

export async function runDeepHealth(
  dataDir: string,
  opts: { mockBridge?: boolean } = {},
): Promise<DeepHealthReport> {
  const cfg = loadConfig(dataDir);
  const checks: HealthCheckItem[] = [];
  const foreign = detectForeignOrStale(dataDir);

  // OS
  if (process.platform === "win32") {
    checks.push({
      id: "os",
      status: "pass",
      message: `Windows ${os.release()}`,
      autoFixable: false,
    });
  } else {
    checks.push({
      id: "os",
      status: "fail",
      message: `Unsupported platform ${process.platform}`,
      repairAction: "Use Windows 10/11 x64",
      autoFixable: false,
    });
  }

  // Data dir writable
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const t = path.join(dataDir, ".write-test");
    fs.writeFileSync(t, "ok");
    fs.unlinkSync(t);
    checks.push({ id: "disk", status: "pass", message: `Writable ${dataDir}`, autoFixable: false });
  } catch (e) {
    checks.push({
      id: "disk",
      status: "fail",
      message: e instanceof Error ? e.message : String(e),
      repairAction: "Fix folder permissions for the app data directory",
      autoFixable: false,
    });
  }

  // Consent
  const consent = new LocalCloudStore(dataDir).getConsent();
  checks.push(
    consent.accepted
      ? { id: "consent", status: "pass", message: "Data agreement accepted", autoFixable: false }
      : {
          id: "consent",
          status: "fail",
          message: "Data agreement not accepted",
          repairAction: "Open Cloud & Privacy and accept the agreement",
          autoFixable: false,
        },
  );

  // Foreign machine
  checks.push(
    foreign.foreign
      ? {
          id: "machine",
          status: "warn",
          message: `New/different PC detected (${foreign.reasons.join(", ")})`,
          repairAction: "Click Prepare this PC or Start All to reconfigure",
          autoFixable: true,
        }
      : {
          id: "machine",
          status: "pass",
          message: "Machine profile matches this PC",
          autoFixable: false,
        },
  );

  // Port
  const port = cfg.httpPort || 18787;
  const portFree = opts.mockBridge ? true : await canBind(port);
  checks.push(
    portFree
      ? { id: "port", status: "pass", message: `Port ${port} free on 127.0.0.1`, autoFixable: false }
      : {
          id: "port",
          status: "fail",
          message: `Port ${port} in use`,
          repairAction: "Auto-heal will pick a free port",
          autoFixable: true,
        },
  );

  // Chrome
  const chromePath = findChromePath();
  checks.push(
    chromePath || opts.mockBridge
      ? {
          id: "chrome",
          status: "pass",
          message: chromePath || "mock",
          autoFixable: false,
        }
      : {
          id: "chrome",
          status: "fail",
          message: "Google Chrome not found",
          repairAction: "Install Google Chrome, then Prepare this PC",
          autoFixable: false,
        },
  );

  // Extension staged
  const staged = fs.existsSync(path.join(dataDir, "extension", "manifest.json"));
  checks.push(
    staged
      ? { id: "extension_staged", status: "pass", message: "Extension staged in data dir", autoFixable: false }
      : {
          id: "extension_staged",
          status: "warn",
          message: "Extension not staged yet",
          repairAction: "Auto-heal will copy the extension",
          autoFixable: true,
        },
  );

  // Launch config
  const lcPath = path.join(dataDir, "native-host", "launch-config.json");
  if (fs.existsSync(lcPath)) {
    try {
      const lc = JSON.parse(fs.readFileSync(lcPath, "utf8")) as {
        execPath?: string;
        runtimeScript?: string;
      };
      const ok =
        Boolean(lc.execPath && fs.existsSync(lc.execPath)) &&
        Boolean(lc.runtimeScript && fs.existsSync(lc.runtimeScript));
      checks.push(
        ok
          ? { id: "launch_config", status: "pass", message: "Launch paths exist", autoFixable: false }
          : {
              id: "launch_config",
              status: "fail",
              message: "Launch paths point to missing files (often after moving PCs)",
              repairAction: "Auto-heal will rewrite paths for this PC",
              autoFixable: true,
            },
      );
    } catch {
      checks.push({
        id: "launch_config",
        status: "fail",
        message: "Corrupt launch-config.json",
        repairAction: "Auto-heal will rewrite",
        autoFixable: true,
      });
    }
  } else {
    checks.push({
      id: "launch_config",
      status: "warn",
      message: "No launch-config yet (will be written on start)",
      autoFixable: true,
    });
  }

  // Native host
  const nm = isNativeHostRegistered();
  const nmPathOk = Boolean(nm.manifestPath && fs.existsSync(nm.manifestPath));
  checks.push(
    nm.registered && nmPathOk
      ? { id: "native_host", status: "pass", message: "Native host registered", autoFixable: false }
      : nm.registered && !nmPathOk
        ? {
            id: "native_host",
            status: "fail",
            message: "Registry points to missing native host manifest",
            repairAction: "Auto-heal will re-register",
            autoFixable: true,
          }
        : {
            id: "native_host",
            status: "warn",
            message: "Native host not registered (HTTP path can still work)",
            repairAction: "Auto-heal will register",
            autoFixable: true,
          },
  );

  // Extension connection
  const bridge = opts.mockBridge
    ? { connected: true, extensionId: "mock" }
    : getBridgeStatus();
  checks.push(
    bridge.connected || opts.mockBridge
      ? {
          id: "extension_connected",
          status: "pass",
          message: `Extension connected${bridge.extensionId ? ` (${bridge.extensionId})` : ""}`,
          autoFixable: false,
        }
      : {
          id: "extension_connected",
          status: "fail",
          message: "Extension not connected to Control Center",
          repairAction: "Auto-heal will Connect Chrome (may relaunch Chrome)",
          autoFixable: true,
        },
  );

  // Emergency
  if (cfg.emergencyStop) {
    checks.push({
      id: "emergency",
      status: "fail",
      message: "Emergency Stop is active",
      repairAction: "Clear Emergency Stop in the Control Center",
      autoFixable: false,
    });
  } else {
    checks.push({ id: "emergency", status: "pass", message: "Emergency stop off", autoFixable: false });
  }

  // Cloud soft
  const cloudUrl = cfg.cloudUrl || process.env.CHROME_MCP_CLOUD_URL;
  let cloudReachable: boolean | null = null;
  if (cloudUrl && !opts.mockBridge) {
    try {
      const u = new URL(cloudUrl);
      const healthUrl = cloudUrl.replace(/\/v1\/ingest\/?$/, "/health");
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(healthUrl.startsWith("http") ? healthUrl : `http://${u.host}/health`, {
        signal: ctrl.signal,
      }).catch(() => null);
      clearTimeout(t);
      cloudReachable = Boolean(res && res.ok);
    } catch {
      cloudReachable = false;
    }
    checks.push(
      cloudReachable
        ? { id: "cloud", status: "pass", message: "Cloud backend reachable", autoFixable: false }
        : {
            id: "cloud",
            status: "warn",
            message: "Cloud backend not reachable (local mode OK; sync queues)",
            repairAction: "Start owner cloud backend if you need live sync",
            autoFixable: false,
          },
    );
  } else {
    checks.push({
      id: "cloud",
      status: "warn",
      message: "Cloud URL not checked",
      autoFixable: false,
    });
  }

  const components: Record<string, CheckStatus> = {};
  for (const c of checks) components[c.id] = c.status;

  const fails = checks.filter((c) => c.status === "fail");
  // Ready for local automation: chrome + extension + not emergency + disk
  const readyBlockers = fails.filter((c) =>
    ["os", "disk", "chrome", "extension_connected", "emergency"].includes(c.id),
  );
  const primary = readyBlockers[0] || fails[0];

  return {
    ok: readyBlockers.length === 0 && (opts.mockBridge || Boolean(chromePath)),
    time: new Date().toISOString(),
    primaryFailure: primary?.message,
    repairAction: primary?.repairAction,
    foreignMachine: foreign.foreign,
    foreignReasons: foreign.reasons,
    checks,
    chrome: { found: Boolean(chromePath) || !!opts.mockBridge, path: chromePath },
    extension: {
      connected: bridge.connected || !!opts.mockBridge,
      extensionId: bridge.extensionId,
      staged,
    },
    nativeHost: { registered: nm.registered, manifestPath: nm.manifestPath },
    ports: { httpPort: port, conflict: !portFree },
    consent: { accepted: consent.accepted },
    cloud: { reachable: cloudReachable, url: cloudUrl },
    versions: {
      app: MCP_APP_VERSION,
      node: process.version,
      platform: `${os.platform()} ${os.release()}`,
    },
    components,
  };
}
