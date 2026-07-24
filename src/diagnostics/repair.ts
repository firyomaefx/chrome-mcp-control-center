import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, saveConfig } from "../config.js";
import {
  isNativeHostRegistered,
  readHostLaunchConfig,
  registerNativeHost,
  resolveNodeBinary,
  writeHostLauncher,
  writeNativeHostManifest,
} from "./windows.js";
import { runHealthCheck, type HealthReport } from "./health.js";

export interface RepairReport {
  time: string;
  actions: string[];
  nativeHostRegistered: boolean;
  health?: HealthReport;
  ok: boolean;
  message: string;
}

/**
 * Resolve a portable native-host launch (works on any PC).
 * Priority:
 * 1) launch-config.json written by Electron Control Center
 * 2) dist/cli.js host (dev)
 * 3) dist/native-host/host.js (dev)
 */
export function resolvePortableHostLaunch(dataDir: string): {
  bin: string;
  script: string;
  args: string[];
  note: string;
} {
  const cfg = readHostLaunchConfig(dataDir);
  if (cfg?.execPath && cfg.runtimeScript && fs.existsSync(cfg.execPath) && fs.existsSync(cfg.runtimeScript)) {
    return {
      bin: cfg.execPath,
      script: cfg.runtimeScript,
      args: cfg.args?.length ? cfg.args : ["host"],
      note: "Using Electron runtime-bundle host launch-config",
    };
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const cliJs = path.resolve(here, "..", "cli.js");
  if (fs.existsSync(cliJs)) {
    return {
      bin: resolveNodeBinary(),
      script: cliJs,
      args: ["host"],
      note: "Using dist/cli.js host (dev)",
    };
  }

  const hostJs = path.resolve(here, "..", "native-host", "host.js");
  if (fs.existsSync(hostJs)) {
    return {
      bin: resolveNodeBinary(),
      script: hostJs,
      args: [],
      note: "Using dist/native-host/host.js (dev)",
    };
  }

  // Last resort: still write launcher pointing at env or node + missing path for diagnostics
  return {
    bin: resolveNodeBinary(),
    script: hostJs,
    args: [],
    note: "Host script not found — HTTP extension path remains primary",
  };
}

export async function repairSystem(
  dataDir: string,
  opts: { onlyIfNeeded?: boolean } = {},
): Promise<RepairReport> {
  const actions: string[] = [];
  const cfg = loadConfig(dataDir);
  const nm = isNativeHostRegistered();

  if (opts.onlyIfNeeded && nm.registered) {
    return {
      time: new Date().toISOString(),
      actions: ["Native host already registered"],
      nativeHostRegistered: true,
      ok: true,
      message: "No repair needed",
    };
  }

  const launch = resolvePortableHostLaunch(dataDir);
  actions.push(launch.note);
  const launcher = writeHostLauncher(dataDir, launch.script, launch.args, launch.bin);
  actions.push(`Wrote host launcher: ${launcher}`);
  actions.push(`Host bin: ${launch.bin}`);
  actions.push(`Host script: ${launch.script} ${launch.args.join(" ")}`);

  const extensionIds = cfg.extensionId ? [cfg.extensionId] : [];
  const manifestPath = writeNativeHostManifest(dataDir, launcher, extensionIds);
  actions.push(`Wrote native host manifest: ${manifestPath}`);

  try {
    registerNativeHost(manifestPath);
    actions.push("Registered Native Messaging host in HKCU");
  } catch (e) {
    actions.push(`Registry registration failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  for (const d of cfg.approvedDownloadDirs) {
    try {
      fs.mkdirSync(d, { recursive: true });
      actions.push(`Ensured download dir: ${d}`);
    } catch {
      /* ignore */
    }
  }

  saveConfig(dataDir, cfg);
  const registered = isNativeHostRegistered().registered;
  // HTTP is primary control plane — repair is OK if host file missing but registration attempted
  const hostExists = fs.existsSync(launch.script);
  const health = await runHealthCheck(dataDir);
  return {
    time: new Date().toISOString(),
    actions,
    nativeHostRegistered: registered,
    health,
    ok: (registered && hostExists) || process.platform !== "win32" || registered,
    message: registered
      ? hostExists
        ? "Repair completed — Native Messaging re-registered"
        : "Native host registered; host script may be missing — extension HTTP path is primary"
      : "Repair attempted — verify Chrome extension connection via Start All / Connect Chrome",
  };
}
