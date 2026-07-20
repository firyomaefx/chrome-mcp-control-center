import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stageExtension } from "../src/chrome/stage-extension.ts";
import { connectChrome } from "../src/chrome/connect.ts";
import { bridge } from "../src/browser/bridge.ts";
import { runHealthCheck } from "../src/diagnostics/health.ts";
import { defaultConfig, saveConfig } from "../src/config.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extSrc = path.join(root, "extension");

describe("stageExtension", () => {
  it("copies extension into dataDir", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-mcp-stage-"));
    const r = stageExtension(dataDir, extSrc);
    assert.equal(r.copied, true);
    assert.ok(fs.existsSync(path.join(r.stagedPath, "manifest.json")));
    assert.ok(fs.existsSync(path.join(r.stagedPath, "background.js")));
    assert.ok(fs.existsSync(path.join(dataDir, "http-port.json")));
  });
});

describe("connectChrome", () => {
  it("returns success immediately when bridge already connected (no Chrome kill)", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-mcp-conn-"));
    saveConfig(dataDir, defaultConfig());
    bridge.disableMock();
    bridge.touchExtension("testid012345678901234567890123");
    const r = await connectChrome({
      dataDir,
      extensionSource: extSrc,
      dryRun: true,
      skipWait: true,
    });
    assert.equal(r.ok, true);
    assert.equal(r.connected, true);
    assert.equal(r.relaunched, false);
    assert.ok(r.steps.some((s) => /already connected/i.test(s)));
  });

  it("stages extension in dryRun when not connected", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-mcp-conn2-"));
    saveConfig(dataDir, defaultConfig());
    bridge.disableMock();
    // Force disconnected
    bridge.setConnected(false);
    // Clear lastSeen staleness by not touching
    const r = await connectChrome({
      dataDir,
      extensionSource: extSrc,
      dryRun: true,
      skipWait: true,
    });
    assert.ok(r.stagedPath);
    assert.ok(fs.existsSync(path.join(r.stagedPath!, "manifest.json")));
    assert.ok(r.steps.some((s) => /Staged extension/i.test(s)));
  });
});

describe("health HTTP-primary gate", () => {
  it("Ready when extension HTTP connected even if NM missing", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-mcp-health-"));
    saveConfig(dataDir, { ...defaultConfig(), emergencyStop: false });
    bridge.disableMock();
    bridge.touchExtension("extid");
    // mockBridge false — uses real bridge connected
    // Chrome may or may not be found on CI machine — if found and connected, ok
    const h = await runHealthCheck(dataDir, { mockBridge: false });
    if (h.chrome.found) {
      assert.equal(h.extension.connected, true);
      assert.equal(h.ok, true);
      assert.equal(h.primaryFailure, undefined);
    } else {
      // Without Chrome binary, not Ready — but message is Chrome not found, not extension folder
      assert.equal(h.extension.connected, true);
      assert.match(String(h.primaryFailure), /Chrome not found/);
    }
  });

  it("mock bridge still reports ok", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-mcp-health2-"));
    saveConfig(dataDir, defaultConfig());
    const h = await runHealthCheck(dataDir, { mockBridge: true });
    assert.equal(h.ok, true);
    assert.equal(h.extension.connected, true);
  });
});
