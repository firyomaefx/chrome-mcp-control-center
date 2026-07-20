/**
 * Single-click Chrome + extension connection orchestration.
 *
 * Strategy: stage extension → repair NM → if not connected, (re)launch Chrome
 * with --load-extension on the user's real profile (no custom user-data-dir).
 */

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadConfig, saveConfig } from "../config.js";
import { bridge, getBridgeStatus } from "../browser/bridge.js";
import { findChromePath, registerNativeHost, writeHostLauncher, writeNativeHostManifest } from "../diagnostics/windows.js";
import { repairSystem } from "../diagnostics/repair.js";
import { stageExtension } from "./stage-extension.js";
import { fileURLToPath } from "node:url";

export interface ConnectReport {
  ok: boolean;
  steps: string[];
  stagedPath?: string;
  extensionId?: string;
  chromePath?: string;
  relaunched: boolean;
  connected: boolean;
  error?: string;
  repairAction?: string;
  durationMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isChromeRunning(): boolean {
  if (process.platform !== "win32") return false;
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /NH', {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    return /chrome\.exe/i.test(out);
  } catch {
    return false;
  }
}

/** Gracefully stop Chrome so --load-extension is honored on next start. */
export function stopChromeProcesses(): string[] {
  const steps: string[] = [];
  if (process.platform !== "win32") {
    steps.push("Non-Windows: skip Chrome stop");
    return steps;
  }
  try {
    execSync("taskkill /IM chrome.exe /T", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    steps.push("Stopped Chrome processes (taskkill)");
  } catch {
    steps.push("Chrome stop: no process or already closed");
  }
  return steps;
}

export function launchChromeWithExtension(chromePath: string, extensionPath: string): void {
  const args = [
    `--load-extension=${extensionPath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--restore-last-session",
  ];
  // Detached so Control Center is not tied to Chrome lifetime
  const child = spawn(chromePath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

export async function waitForExtensionConnected(
  timeoutMs = 45000,
  pollMs = 500,
): Promise<{ connected: boolean; extensionId?: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = getBridgeStatus();
    if (st.connected) {
      return { connected: true, extensionId: st.extensionId };
    }
    await sleep(pollMs);
  }
  return { connected: false };
}

function rebindNativeHost(dataDir: string, extensionId?: string): string[] {
  const steps: string[] = [];
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const hostJs = path.resolve(here, "..", "native-host", "host.js");
    const launcher = writeHostLauncher(dataDir, hostJs);
    const ids = extensionId ? [extensionId] : [];
    const manifestPath = writeNativeHostManifest(dataDir, launcher, ids);
    registerNativeHost(manifestPath);
    steps.push(`Native host rebound for extension ${extensionId || "(pending id)"}`);
  } catch (e) {
    steps.push(`Native host rebind warning: ${e instanceof Error ? e.message : String(e)}`);
  }
  return steps;
}

export interface ConnectOptions {
  dataDir: string;
  /** Skip waiting (tests) */
  skipWait?: boolean;
  /** Force relaunch even if already connected */
  forceRelaunch?: boolean;
  /** Wait timeout for extension register */
  timeoutMs?: number;
  /** Source extension dir override */
  extensionSource?: string;
  /** Do not kill/launch Chrome (unit tests) */
  dryRun?: boolean;
}

/**
 * Full single-click connect path.
 */
export async function connectChrome(opts: ConnectOptions): Promise<ConnectReport> {
  const t0 = Date.now();
  const steps: string[] = [];
  let relaunched = false;

  try {
    const { stagedPath, sourceDir } = stageExtension(opts.dataDir, opts.extensionSource);
    steps.push(`Staged extension from ${sourceDir} → ${stagedPath}`);

    const repair = await repairSystem(opts.dataDir, { onlyIfNeeded: false });
    steps.push(...repair.actions);

    if (!opts.forceRelaunch && getBridgeStatus().connected) {
      steps.push("Extension already connected — no relaunch needed");
      const st = getBridgeStatus();
      if (st.extensionId) {
        const cfg = loadConfig(opts.dataDir);
        if (cfg.extensionId !== st.extensionId) {
          saveConfig(opts.dataDir, { ...cfg, extensionId: st.extensionId });
          steps.push(...rebindNativeHost(opts.dataDir, st.extensionId));
        }
      }
      return {
        ok: true,
        steps,
        stagedPath,
        extensionId: st.extensionId,
        relaunched: false,
        connected: true,
        durationMs: Date.now() - t0,
      };
    }

    const chromePath = findChromePath();
    if (!chromePath) {
      return {
        ok: false,
        steps,
        stagedPath,
        relaunched: false,
        connected: false,
        error: "CHROME_NOT_FOUND",
        repairAction: "Install Google Chrome, then click Connect Chrome again",
        durationMs: Date.now() - t0,
      };
    }
    steps.push(`Chrome found: ${chromePath}`);

    if (!opts.dryRun) {
      if (isChromeRunning() || opts.forceRelaunch) {
        steps.push(...stopChromeProcesses());
        // Brief pause so profile locks release
        await sleep(1500);
        relaunched = true;
      } else {
        steps.push("Chrome was not running — cold start with extension");
      }
      launchChromeWithExtension(chromePath, stagedPath);
      steps.push(`Launched Chrome with --load-extension=${stagedPath}`);
    } else {
      steps.push("dryRun: skipped Chrome launch");
    }

    if (opts.skipWait || opts.dryRun) {
      return {
        ok: opts.dryRun ? true : getBridgeStatus().connected,
        steps,
        stagedPath,
        chromePath,
        relaunched,
        connected: getBridgeStatus().connected,
        durationMs: Date.now() - t0,
      };
    }

    steps.push("Waiting for extension to register over HTTP…");
    const waited = await waitForExtensionConnected(opts.timeoutMs ?? 45000);
    if (!waited.connected) {
      return {
        ok: false,
        steps,
        stagedPath,
        chromePath,
        relaunched,
        connected: false,
        error: "EXTENSION_NOT_CONNECTED",
        repairAction:
          "Chrome started but extension did not register. Click Connect Chrome again, or check that Control Center services are running on port 18787.",
        durationMs: Date.now() - t0,
      };
    }

    steps.push(`Extension registered${waited.extensionId ? ` (id ${waited.extensionId})` : ""}`);
    if (waited.extensionId) {
      const cfg = loadConfig(opts.dataDir);
      saveConfig(opts.dataDir, { ...cfg, extensionId: waited.extensionId, wizardCompleted: true });
      steps.push(...rebindNativeHost(opts.dataDir, waited.extensionId));
    }

    return {
      ok: true,
      steps,
      stagedPath,
      chromePath,
      extensionId: waited.extensionId,
      relaunched,
      connected: true,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    steps.push(`Error: ${msg}`);
    return {
      ok: false,
      steps,
      relaunched,
      connected: getBridgeStatus().connected,
      error: msg,
      repairAction: "Click Repair System, then Connect Chrome",
      durationMs: Date.now() - t0,
    };
  }
}

/** For supervisor: ensure connected, relaunch if needed. */
export async function ensureChromeConnected(dataDir: string): Promise<ConnectReport> {
  if (bridge.isMock() || process.env.CHROME_MCP_MOCK === "1") {
    bridge.enableMock();
    return {
      ok: true,
      steps: ["Mock bridge enabled"],
      relaunched: false,
      connected: true,
      durationMs: 0,
    };
  }
  return connectChrome({ dataDir });
}
