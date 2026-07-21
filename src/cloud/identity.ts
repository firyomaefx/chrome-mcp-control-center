import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import type { PlanTier } from "./types.js";

export interface DeviceIdentity {
  userId: string;
  deviceId: string;
  plan: PlanTier;
  /** Device credential for ingest (hashed server-side) */
  deviceKey: string;
  createdAt: string;
}

export function loadOrCreateIdentity(dataDir: string): DeviceIdentity {
  const p = path.join(dataDir, "device-identity.json");
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, "utf8")) as DeviceIdentity;
  }
  const identity: DeviceIdentity = {
    userId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    plan: (process.env.CHROME_MCP_PLAN as PlanTier) || "free",
    deviceKey: crypto.randomBytes(32).toString("base64url"),
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(identity, null, 2), "utf8");
  return identity;
}

export function setPlan(dataDir: string, plan: PlanTier): DeviceIdentity {
  const id = loadOrCreateIdentity(dataDir);
  id.plan = plan;
  fs.writeFileSync(path.join(dataDir, "device-identity.json"), JSON.stringify(id, null, 2), "utf8");
  return id;
}

export function osVersionString(): string {
  return `${os.platform()} ${os.release()} ${os.arch()}`;
}

export function chromeVersionFromEnv(): string | undefined {
  return process.env.CHROME_MCP_CHROME_VERSION;
}
