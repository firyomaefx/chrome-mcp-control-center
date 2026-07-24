/**
 * Single-click Chrome + extension connection orchestration.
 *
 * Chrome 137+/150 removed --load-extension on branded Chrome.
 * Primary path: pack CRX + HKCU ExtensionInstallForcelist + relaunch Chrome.
 * Fallback: legacy --load-extension flags for older Chrome / Chromium.
 */

import { spawn, execSync, execFileSync } from "node:child_process";
import path from "node:path";
import { loadConfig, saveConfig } from "../config.js";
import { bridge, getBridgeStatus } from "../browser/bridge.js";
import {
  findChromePath,
  registerNativeHost,
  writeHostLauncher,
  writeNativeHostManifest,
} from "../diagnostics/windows.js";
import { repairSystem, resolvePortableHostLaunch } from "../diagnostics/repair.js";
import { stageExtension } from "./stage-extension.js";
import { packExtensionCrx, writeUpdateXml } from "./pack-crx.js";
import { applyForceInstallPolicy } from "./policy.js";

export interface ConnectReport {
  ok: boolean;
  steps: string[];
  stagedPath?: string;
  extensionId?: string;
  chromePath?: string;
  chromeVersion?: string;
  method?: "policy-crx" | "load-extension" | "already-connected" | "mock";
  relaunched: boolean;
  connected: boolean;
  error?: string;
  repairAction?: string;
  durationMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function getChromeVersion(chromePath: string): string {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `(Get-Item -LiteralPath '${chromePath.replace(/'/g, "''")}').VersionInfo.FileVersion`,
        ],
        { encoding: "utf8", windowsHide: true, timeout: 10000 },
      ).trim();
      return out || "unknown";
    }
  } catch {
    /* ignore */
  }
  return "unknown";
}

function chromeMajor(version: string): number {
  const n = parseInt(version.split(".")[0] || "0", 10);
  return Number.isFinite(n) ? n : 0;
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

/** Legacy path for Chromium / old Chrome */
export function launchChromeWithExtension(chromePath: string, extensionPath: string): void {
  const args = [
    `--disable-features=DisableLoadExtensionCommandLineSwitch`,
    `--load-extension=${extensionPath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--restore-last-session",
  ];
  const child = spawn(chromePath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

/** Normal launch after policy applied (force-install on startup) */
export function launchChromeNormal(chromePath: string): void {
  const args = ["--no-first-run", "--no-default-browser-check", "--restore-last-session"];
  const child = spawn(chromePath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

export async function waitForExtensionConnected(
  timeoutMs = 60000,
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
    const launch = resolvePortableHostLaunch(dataDir);
    const launcher = writeHostLauncher(dataDir, launch.script, launch.args, launch.bin);
    const ids = extensionId ? [extensionId] : [];
    const manifestPath = writeNativeHostManifest(dataDir, launcher, ids);
    registerNativeHost(manifestPath);
    steps.push(`Native host rebound for extension ${extensionId || "(pending id)"} (${launch.note})`);
  } catch (e) {
    steps.push(`Native host rebind warning: ${e instanceof Error ? e.message : String(e)}`);
  }
  return steps;
}

export interface ConnectOptions {
  dataDir: string;
  skipWait?: boolean;
  forceRelaunch?: boolean;
  timeoutMs?: number;
  extensionSource?: string;
  dryRun?: boolean;
}

/**
 * Full single-click connect path for modern Chrome (policy CRX) + legacy fallback.
 */
export async function connectChrome(opts: ConnectOptions): Promise<ConnectReport> {
  const t0 = Date.now();
  const steps: string[] = [];
  let relaunched = false;
  let method: ConnectReport["method"] = "policy-crx";

  try {
    const port = Number(process.env.CHROME_MCP_HTTP_PORT || loadConfig(opts.dataDir).httpPort || 18787);
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
        method: "already-connected",
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
    const chromeVersion = getChromeVersion(chromePath);
    const major = chromeMajor(chromeVersion);
    steps.push(`Chrome found: ${chromePath} (v${chromeVersion})`);

    // Pack CRX + policy (works on Chrome 150 when --load-extension is dead)
    let extensionId: string | undefined;
    let packOk = false;
    try {
      const packed = packExtensionCrx(opts.dataDir, stagedPath);
      extensionId = packed.extensionId;
      const urls = writeUpdateXml(
        opts.dataDir,
        packed.extensionId,
        packed.version,
        port,
        packed.crxPath,
      );
      steps.push(`Packed CRX id=${packed.extensionId} v=${packed.version}`);
      // file:// update URL so force-install works without HTTP dependency
      const pol = applyForceInstallPolicy(packed.extensionId, urls.updateUrlFile);
      steps.push(...pol.steps);
      steps.push(`Policy update URL: ${urls.updateUrlFile}`);
      packOk = pol.ok;
      method = "policy-crx";

      const cfg = loadConfig(opts.dataDir);
      saveConfig(opts.dataDir, { ...cfg, extensionId: packed.extensionId });
      steps.push(...rebindNativeHost(opts.dataDir, packed.extensionId));
    } catch (e) {
      steps.push(`CRX/policy path failed: ${e instanceof Error ? e.message : String(e)}`);
      packOk = false;
    }

    if (!opts.dryRun) {
      if (isChromeRunning() || opts.forceRelaunch || packOk) {
        steps.push(...stopChromeProcesses());
        await sleep(2000);
        relaunched = true;
      }

      if (packOk) {
        launchChromeNormal(chromePath);
        steps.push("Launched Chrome (force-install policy active)");
      } else {
        method = "load-extension";
        launchChromeWithExtension(chromePath, stagedPath);
        steps.push(
          `Launched Chrome with --load-extension (legacy; may be ignored on Chrome ${major}+)`,
        );
      }
    } else {
      steps.push("dryRun: skipped Chrome launch");
    }

    if (opts.skipWait || opts.dryRun) {
      return {
        ok: opts.dryRun ? true : getBridgeStatus().connected,
        steps,
        stagedPath,
        chromePath,
        chromeVersion,
        extensionId,
        method,
        relaunched,
        connected: getBridgeStatus().connected,
        durationMs: Date.now() - t0,
      };
    }

    steps.push("Waiting for extension to register over HTTP (up to 60s)…");
    const waited = await waitForExtensionConnected(opts.timeoutMs ?? 60000);
    if (!waited.connected) {
      return {
        ok: false,
        steps,
        stagedPath,
        chromePath,
        chromeVersion,
        extensionId,
        method,
        relaunched,
        connected: false,
        error: "EXTENSION_NOT_CONNECTED",
        repairAction:
          major >= 137
            ? "Chrome 137+ blocks --load-extension. We applied force-install policy + CRX. Open chrome://policy and confirm ExtensionInstallForcelist is set, then click Connect Chrome again. If policy is blocked by organization, load the staged extension once via chrome://extensions → Load unpacked."
            : "Extension did not register. Click Connect Chrome again.",
        durationMs: Date.now() - t0,
      };
    }

    steps.push(`Extension registered${waited.extensionId ? ` (id ${waited.extensionId})` : ""}`);
    const finalId = waited.extensionId || extensionId;
    if (finalId) {
      const cfg = loadConfig(opts.dataDir);
      saveConfig(opts.dataDir, { ...cfg, extensionId: finalId, wizardCompleted: true });
      steps.push(...rebindNativeHost(opts.dataDir, finalId));
    }

    return {
      ok: true,
      steps,
      stagedPath,
      chromePath,
      chromeVersion,
      extensionId: finalId,
      method,
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

export async function ensureChromeConnected(dataDir: string): Promise<ConnectReport> {
  if (bridge.isMock() || process.env.CHROME_MCP_MOCK === "1") {
    bridge.enableMock();
    return {
      ok: true,
      steps: ["Mock bridge enabled"],
      method: "mock",
      relaunched: false,
      connected: true,
      durationMs: 0,
    };
  }
  return connectChrome({ dataDir });
}
