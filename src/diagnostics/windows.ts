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

export function writeHostLauncher(dataDir: string, nodeScript: string): string {
  const cmdPath = hostLauncherPath(dataDir);
  // Use process.execPath when ELECTRON_RUN_AS_NODE, else node
  const nodeBin = process.env.CHROME_MCP_NODE || "node";
  const content = `@echo off\r\n"${nodeBin}" "${nodeScript.replace(/\//g, "\\")}" %*\r\n`;
  fs.writeFileSync(cmdPath, content, "utf8");
  return cmdPath;
}

export function windowsVersion(): string {
  return `${os.type()} ${os.release()}`;
}
