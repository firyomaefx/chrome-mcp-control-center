import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

export const NATIVE_HOST_NAME = "com.chromemcp.controlcenter";

export function findChromePath(): string | undefined {
  const candidates = [
    process.env.CHROME_PATH,
    path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return undefined;
}

export function nativeHostManifestPath(dataDir: string): string {
  return path.join(dataDir, "native-host", `${NATIVE_HOST_NAME}.json`);
}

export function writeNativeHostManifest(
  dataDir: string,
  hostExe: string,
  extensionIds: string[],
): string {
  const dir = path.join(dataDir, "native-host");
  fs.mkdirSync(dir, { recursive: true });
  const manifestPath = nativeHostManifestPath(dataDir);
  const allowed = extensionIds.filter(Boolean).map((id) => `chrome-extension://${id}/`);
  // During unpackaged dev, allow a placeholder; Chrome still requires exact ID match.
  if (allowed.length === 0) {
    allowed.push("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/");
  }
  const manifest = {
    name: NATIVE_HOST_NAME,
    description: "Chrome MCP Control Center Native Messaging Host",
    path: hostExe.replace(/\//g, "\\"),
    type: "stdio",
    allowed_origins: allowed,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifestPath;
}

export function isNativeHostRegistered(): { registered: boolean; manifestPath?: string } {
  if (process.platform !== "win32") {
    return { registered: false };
  }
  try {
    const out = execSync(
      `reg query "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}" /ve`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    const m = out.match(/REG_SZ\s+(.+)/);
    const manifestPath = m?.[1]?.trim();
    return { registered: Boolean(manifestPath && fs.existsSync(manifestPath)), manifestPath };
  } catch {
    return { registered: false };
  }
}

export function registerNativeHost(manifestPath: string): void {
  if (process.platform !== "win32") return;
  const key = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`;
  execSync(`reg add "${key}" /ve /t REG_SZ /d "${manifestPath.replace(/\//g, "\\")}" /f`, {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export function hostLauncherPath(dataDir: string): string {
  const dir = path.join(dataDir, "native-host");
  fs.mkdirSync(dir, { recursive: true });
  // cmd launcher so Chrome can start node host without depending on PATH quirks
  return path.join(dir, "chrome-mcp-host.cmd");
}

/**
 * Prefer absolute Node/Electron binary so other PCs do not depend on PATH `node`.
 * When running under Electron (ELECTRON_RUN_AS_NODE or packaged), use process.execPath.
 */
export function resolveNodeBinary(): string {
  if (process.env.CHROME_MCP_NODE && fs.existsSync(process.env.CHROME_MCP_NODE)) {
    return process.env.CHROME_MCP_NODE;
  }
  // Electron main/runtime often has ELECTRON_RUN_AS_NODE=1 and execPath is usable as node
  if (process.env.ELECTRON_RUN_AS_NODE === "1" || process.versions.electron) {
    return process.execPath;
  }
  // Standard Node process
  if (process.execPath && fs.existsSync(process.execPath)) {
    return process.execPath;
  }
  return "node";
}

export function writeHostLauncher(
  dataDir: string,
  nodeScript: string,
  extraArgs: string[] = [],
  nodeBinOverride?: string,
): string {
  const cmdPath = hostLauncherPath(dataDir);
  const nodeBin = nodeBinOverride || resolveNodeBinary();
  const parts = [nodeScript, ...extraArgs].map((p) => `"${String(p).replace(/\//g, "\\")}"`);
  // When using Electron binary, force node mode for host script
  const electronAsNode =
    /electron/i.test(nodeBin) ||
    /Chrome MCP/i.test(nodeBin) ||
    process.env.ELECTRON_RUN_AS_NODE === "1" ||
    Boolean(process.versions.electron);
  const content = electronAsNode
    ? `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${nodeBin.replace(/\//g, "\\")}" ${parts.join(" ")} %*\r\n`
    : `@echo off\r\n"${nodeBin.replace(/\//g, "\\")}" ${parts.join(" ")} %*\r\n`;
  fs.writeFileSync(cmdPath, content, "utf8");
  return cmdPath;
}

export interface HostLaunchConfig {
  execPath: string;
  runtimeScript: string;
  args?: string[];
}

export function writeHostLaunchConfig(dataDir: string, cfg: HostLaunchConfig): string {
  const dir = path.join(dataDir, "native-host");
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "launch-config.json");
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), "utf8");
  return p;
}

export function readHostLaunchConfig(dataDir: string): HostLaunchConfig | null {
  const p = path.join(dataDir, "native-host", "launch-config.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as HostLaunchConfig;
  } catch {
    return null;
  }
}

export function windowsVersion(): string {
  return `${os.type()} ${os.release()}`;
}
