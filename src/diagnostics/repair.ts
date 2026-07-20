import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, saveConfig } from "../config.js";
import {
  isNativeHostRegistered,
  registerNativeHost,
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

  // Resolve host script path
  const here = path.dirname(fileURLToPath(import.meta.url));
  const hostJs = path.resolve(here, "..", "native-host", "host.js");
  const launcher = writeHostLauncher(dataDir, hostJs);
  actions.push(`Wrote host launcher: ${launcher}`);

  const extensionIds = cfg.extensionId ? [cfg.extensionId] : [];
  const manifestPath = writeNativeHostManifest(dataDir, launcher, extensionIds);
  actions.push(`Wrote native host manifest: ${manifestPath}`);

  try {
    registerNativeHost(manifestPath);
    actions.push("Registered Native Messaging host in HKCU");
  } catch (e) {
    actions.push(`Registry registration failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Ensure download dir exists
  for (const d of cfg.approvedDownloadDirs) {
    try {
      const fs = await import("node:fs");
      fs.mkdirSync(d, { recursive: true });
      actions.push(`Ensured download dir: ${d}`);
    } catch {
      /* ignore */
    }
  }

  saveConfig(dataDir, cfg);
  const registered = isNativeHostRegistered().registered;
  const health = await runHealthCheck(dataDir);
  return {
    time: new Date().toISOString(),
    actions,
    nativeHostRegistered: registered,
    health,
    ok: registered || process.platform !== "win32",
    message: registered
      ? "Repair completed — Native Messaging re-registered"
      : "Repair attempted — verify Chrome extension ID and re-run Repair",
  };
}
