/**
 * Auto-heal playbook: detect this PC, fix stale foreign state, repair components.
 */

import fs from "node:fs";
import path from "node:path";
import { ensureDataDirs, loadConfig, saveConfig } from "../config.js";
import { stageExtension } from "../chrome/stage-extension.js";
import { ensureChromeConnected } from "../chrome/connect.js";
import { getBridgeStatus } from "../browser/bridge.js";
import { repairSystem } from "./repair.js";
import { ensurePortAvailable } from "./ports.js";
import {
  buildCurrentProfile,
  detectForeignOrStale,
  saveProfile,
  type MachineProfile,
} from "./machine-profile.js";
import { runDeepHealth, type DeepHealthReport } from "./deep-health.js";
import { writeHostLaunchConfig } from "./windows.js";

export interface HealStep {
  step: string;
  ok: boolean;
  detail?: string;
  autoFixed?: boolean;
}

export interface HealReport {
  ok: boolean;
  foreignMachine: boolean;
  foreignReasons: string[];
  steps: HealStep[];
  health: DeepHealthReport;
  profile: MachineProfile;
  primaryUserAction?: string;
  durationMs: number;
}

export interface HealOptions {
  dataDir: string;
  /** soft = no Chrome kill/relaunch unless launch paths broken */
  soft?: boolean;
  mockBridge?: boolean;
  /** Skip chrome connect (unit tests) */
  skipChromeConnect?: boolean;
  execPath?: string;
  runtimeScript?: string;
  extensionSource?: string;
}

function healLogPath(dataDir: string): string {
  return path.join(dataDir, "logs", "last-heal.json");
}

/**
 * Migrate state that cannot work on another PC; keep user content.
 */
export function migrateForeignState(dataDir: string): HealStep[] {
  const steps: HealStep[] = [];
  const nh = path.join(dataDir, "native-host");

  // Drop stale launch-config — will be rewritten
  const lc = path.join(nh, "launch-config.json");
  if (fs.existsSync(lc)) {
    try {
      const j = JSON.parse(fs.readFileSync(lc, "utf8")) as { execPath?: string; runtimeScript?: string };
      const bad =
        (j.execPath && !fs.existsSync(j.execPath)) ||
        (j.runtimeScript && !fs.existsSync(j.runtimeScript));
      if (bad) {
        fs.unlinkSync(lc);
        steps.push({
          step: "Removed stale launch-config.json (paths from another PC)",
          ok: true,
          autoFixed: true,
        });
      }
    } catch {
      try {
        fs.unlinkSync(lc);
        steps.push({ step: "Removed corrupt launch-config.json", ok: true, autoFixed: true });
      } catch {
        /* ignore */
      }
    }
  }

  // Clear extensionId so force-install rebinds for this machine's CRX
  try {
    const cfg = loadConfig(dataDir);
    if (cfg.extensionId) {
      // keep id if extension still connected
      if (!getBridgeStatus().connected) {
        const next = { ...cfg, extensionId: "" };
        saveConfig(dataDir, next);
        steps.push({
          step: "Cleared stale extensionId for re-bind on this PC",
          ok: true,
          autoFixed: true,
        });
      }
    }
  } catch (e) {
    steps.push({
      step: "extensionId clear",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  steps.push({
    step: "Kept local workflows, history, and consent (user content preserved)",
    ok: true,
  });
  return steps;
}

export async function autoHeal(opts: HealOptions): Promise<HealReport> {
  const t0 = Date.now();
  const steps: HealStep[] = [];
  const dataDir = opts.dataDir;
  ensureDataDirs(dataDir);

  const foreign = detectForeignOrStale(dataDir);
  steps.push({
    step: foreign.foreign
      ? `Foreign/stale PC state detected: ${foreign.reasons.join("; ")}`
      : "Machine profile OK (same PC or first run)",
    ok: true,
    detail: foreign.reasons.join(", "),
  });

  if (foreign.foreign) {
    steps.push(...migrateForeignState(dataDir));
  }

  // Rewrite launch-config when caller provides current Electron paths
  if (opts.execPath && opts.runtimeScript) {
    try {
      writeHostLaunchConfig(dataDir, {
        execPath: opts.execPath,
        runtimeScript: opts.runtimeScript,
        args: ["host"],
      });
      steps.push({
        step: "Wrote native-host launch-config for this PC",
        ok: true,
        autoFixed: true,
        detail: opts.execPath,
      });
    } catch (e) {
      steps.push({
        step: "launch-config write failed",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Port
  let cfg = loadConfig(dataDir);
  try {
    const portResult = await ensurePortAvailable(cfg.httpPort || 18787);
    if (portResult.changed) {
      cfg = { ...cfg, httpPort: portResult.port };
      saveConfig(dataDir, cfg);
      process.env.CHROME_MCP_HTTP_PORT = String(portResult.port);
      steps.push({
        step: `Port conflict fixed: now using ${portResult.port}`,
        ok: true,
        autoFixed: true,
      });
    } else if (portResult.conflict && !portResult.changed) {
      steps.push({
        step: "No free port in range 18787–18826",
        ok: false,
        detail: "Close other Chrome MCP instances",
      });
    } else {
      steps.push({ step: `HTTP port ${portResult.port} available`, ok: true });
    }
  } catch (e) {
    steps.push({
      step: "port check failed",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // Stage extension
  try {
    const staged = stageExtension(dataDir, opts.extensionSource);
    steps.push({
      step: `Staged extension → ${staged.stagedPath}`,
      ok: true,
      autoFixed: true,
    });
  } catch (e) {
    steps.push({
      step: "stage extension failed",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // Native messaging repair
  try {
    const repair = await repairSystem(dataDir, { onlyIfNeeded: false });
    steps.push({
      step: repair.message,
      ok: repair.ok,
      autoFixed: true,
      detail: repair.actions.slice(-3).join(" | "),
    });
  } catch (e) {
    steps.push({
      step: "native host repair failed",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // Chrome connect (full heal only, or soft when not connected and foreign)
  const needChrome =
    !opts.skipChromeConnect &&
    !opts.mockBridge &&
    !getBridgeStatus().connected &&
    (!opts.soft || foreign.foreign);
  if (needChrome) {
    try {
      const conn = await ensureChromeConnected(dataDir);
      steps.push({
        step: conn.ok
          ? `Chrome extension connected (${conn.method || "ok"})`
          : `Chrome connect incomplete: ${conn.error || "unknown"}`,
        ok: conn.ok,
        autoFixed: conn.ok,
        detail: conn.steps?.slice(-4).join(" → "),
      });
    } catch (e) {
      steps.push({
        step: "chrome connect threw",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  } else if (getBridgeStatus().connected) {
    steps.push({ step: "Extension already connected", ok: true });
  } else if (opts.soft) {
    steps.push({
      step: "Soft heal skipped Chrome relaunch (use Start All / Prepare this PC)",
      ok: true,
    });
  }

  const health = await runDeepHealth(dataDir, { mockBridge: opts.mockBridge });
  const profile = buildCurrentProfile(dataDir, {
    httpPort: loadConfig(dataDir).httpPort,
    execPath: opts.execPath || process.execPath,
  });
  saveProfile(dataDir, profile);

  const primaryUserAction =
    health.checks.find((c) => c.status === "fail" && !c.autoFixable)?.repairAction ||
    health.repairAction;

  const report: HealReport = {
    ok: health.ok,
    foreignMachine: foreign.foreign,
    foreignReasons: foreign.reasons,
    steps,
    health,
    profile,
    primaryUserAction,
    durationMs: Date.now() - t0,
  };

  try {
    fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });
    fs.writeFileSync(healLogPath(dataDir), JSON.stringify(report, null, 2), "utf8");
  } catch {
    /* ignore */
  }

  return report;
}

export function readLastHeal(dataDir: string): HealReport | null {
  try {
    const p = healLogPath(dataDir);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as HealReport;
  } catch {
    return null;
  }
}
