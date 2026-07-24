import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  computeMachineId,
  detectForeignOrStale,
  saveProfile,
  buildCurrentProfile,
} from "../src/diagnostics/machine-profile.ts";
import { canBind, ensurePortAvailable, findFreePort } from "../src/diagnostics/ports.ts";
import { migrateForeignState, autoHeal } from "../src/diagnostics/auto-heal.ts";
import { defaultConfig, saveConfig } from "../src/config.ts";

describe("machine profile", () => {
  it("computes stable machineId", () => {
    const a = computeMachineId();
    const b = computeMachineId();
    assert.equal(a, b);
    assert.equal(a.length, 32);
  });

  it("detects foreign when stored machineId differs", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "heal-foreign-"));
    const cur = buildCurrentProfile(dataDir);
    saveProfile(dataDir, { ...cur, machineId: "totally-other-machine-id-0001", hostname: "OLDPC" });
    const d = detectForeignOrStale(dataDir);
    assert.equal(d.foreign, true);
    assert.ok(d.reasons.some((r) => r.includes("machineId_changed")));
  });

  it("detects stale launch-config paths", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "heal-stale-"));
    const cur = buildCurrentProfile(dataDir);
    saveProfile(dataDir, cur);
    const nh = path.join(dataDir, "native-host");
    fs.mkdirSync(nh, { recursive: true });
    fs.writeFileSync(
      path.join(nh, "launch-config.json"),
      JSON.stringify({
        execPath: "C:\\\\Does\\\\Not\\\\Exist\\\\app.exe",
        runtimeScript: "C:\\\\Does\\\\Not\\\\Exist\\\\runtime.mjs",
        args: ["host"],
      }),
      "utf8",
    );
    const d = detectForeignOrStale(dataDir);
    assert.equal(d.foreign, true);
    assert.ok(d.reasons.some((r) => r.includes("missing")));
  });
});

describe("ports", () => {
  it("canBind true for free high port", async () => {
    const p = await findFreePort(39100, 20);
    assert.ok(p != null);
    assert.equal(await canBind(p!), true);
  });

  it("ensurePortAvailable returns preferred when free", async () => {
    const p = await findFreePort(39200, 20);
    const r = await ensurePortAvailable(p!);
    assert.equal(r.changed, false);
    assert.equal(r.port, p);
  });
});

describe("migrate + autoHeal soft", () => {
  it("migrateForeignState removes bad launch-config", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "heal-mig-"));
    saveConfig(dataDir, { ...defaultConfig(), extensionId: "oldid" });
    const nh = path.join(dataDir, "native-host");
    fs.mkdirSync(nh, { recursive: true });
    fs.writeFileSync(
      path.join(nh, "launch-config.json"),
      JSON.stringify({ execPath: "Z:\\\\nope.exe", runtimeScript: "Z:\\\\nope.mjs" }),
      "utf8",
    );
    const steps = migrateForeignState(dataDir);
    assert.ok(steps.some((s) => s.autoFixed));
    assert.equal(fs.existsSync(path.join(nh, "launch-config.json")), false);
  });

  it("autoHeal soft stages extension without requiring chrome connect", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "heal-auto-"));
    saveConfig(dataDir, defaultConfig());
    const ext = path.join(path.resolve("."), "extension");
    const report = await autoHeal({
      dataDir,
      soft: true,
      skipChromeConnect: true,
      mockBridge: true,
      extensionSource: ext,
      execPath: process.execPath,
      runtimeScript: process.execPath, // exists; good enough for path check
    });
    assert.ok(report.steps.length > 0);
    assert.ok(fs.existsSync(path.join(dataDir, "extension", "manifest.json")));
    assert.ok(fs.existsSync(path.join(dataDir, "machine-profile.json")));
  });
});
