/**
 * Machine fingerprint — detect "another PC" vs same machine.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { findChromePath } from "./windows.js";

export const MACHINE_PROFILE_VERSION = 1;

export interface MachineProfile {
  profileVersion: number;
  machineId: string;
  hostname: string;
  os: string;
  arch: string;
  dataDir: string;
  execPath?: string;
  appInstallPath?: string;
  chromePath?: string;
  chromeVersion?: string;
  httpPort?: number;
  lastSeenAt: string;
}

function windowsMachineGuid(): string {
  if (process.platform !== "win32") return "";
  try {
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    const m = out.match(/MachineGuid\s+REG_SZ\s+(.+)/i);
    return m?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

/** Stable id for this PC (not secret; used only for migration detection). */
export function computeMachineId(): string {
  const parts = [
    os.hostname(),
    os.platform(),
    os.arch(),
    windowsMachineGuid(),
    process.env.COMPUTERNAME || "",
    process.env.USERDOMAIN || "",
  ].join("|");
  return crypto.createHash("sha256").update(parts).digest("hex").slice(0, 32);
}

export function profilePath(dataDir: string): string {
  return path.join(dataDir, "machine-profile.json");
}

export function loadStoredProfile(dataDir: string): MachineProfile | null {
  try {
    const p = profilePath(dataDir);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as MachineProfile;
  } catch {
    return null;
  }
}

export function buildCurrentProfile(
  dataDir: string,
  extra: Partial<MachineProfile> = {},
): MachineProfile {
  const chromePath = findChromePath();
  return {
    profileVersion: MACHINE_PROFILE_VERSION,
    machineId: computeMachineId(),
    hostname: os.hostname(),
    os: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    dataDir,
    execPath: process.execPath,
    appInstallPath: process.env.CHROME_MCP_APP_PATH || undefined,
    chromePath,
    httpPort: extra.httpPort,
    lastSeenAt: new Date().toISOString(),
    ...extra,
  };
}

export function saveProfile(dataDir: string, profile: MachineProfile): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(profilePath(dataDir), JSON.stringify(profile, null, 2), "utf8");
}

export interface ForeignCheck {
  foreign: boolean;
  reasons: string[];
  stored: MachineProfile | null;
  current: MachineProfile;
}

/**
 * True when data folder looks like it came from another machine
 * or critical absolute paths no longer exist.
 */
export function detectForeignOrStale(dataDir: string): ForeignCheck {
  const current = buildCurrentProfile(dataDir);
  const stored = loadStoredProfile(dataDir);
  const reasons: string[] = [];

  if (!stored) {
    // First run on this data dir — not foreign, just new
    return { foreign: false, reasons: ["first_profile"], stored: null, current };
  }

  if (stored.machineId !== current.machineId) {
    reasons.push(`machineId_changed:${stored.hostname || "old"}→${current.hostname}`);
  }
  if (stored.hostname && stored.hostname !== current.hostname) {
    reasons.push(`hostname_changed:${stored.hostname}→${current.hostname}`);
  }

  // Stale launch-config paths (classic "worked on my PC" failure)
  const launchPath = path.join(dataDir, "native-host", "launch-config.json");
  if (fs.existsSync(launchPath)) {
    try {
      const lc = JSON.parse(fs.readFileSync(launchPath, "utf8")) as {
        execPath?: string;
        runtimeScript?: string;
      };
      if (lc.execPath && !fs.existsSync(lc.execPath)) {
        reasons.push("launch_config_execPath_missing");
      }
      if (lc.runtimeScript && !fs.existsSync(lc.runtimeScript)) {
        reasons.push("launch_config_runtimeScript_missing");
      }
    } catch {
      reasons.push("launch_config_corrupt");
    }
  }

  const foreign = reasons.some(
    (r) =>
      r.startsWith("machineId_changed") ||
      r.startsWith("hostname_changed") ||
      r.includes("missing") ||
      r.includes("corrupt"),
  );

  return { foreign, reasons, stored, current };
}
