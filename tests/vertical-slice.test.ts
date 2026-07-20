import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Supervisor } from "../src/supervisor/supervisor.ts";
import { createRuntime } from "../src/mcp/server.ts";
import { saveConfig, loadConfig, defaultConfig } from "../src/config.ts";
import { pairLlm } from "../src/pairing/llm.ts";

import { fileURLToPath } from "node:url";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-mcp-test-"));
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("vertical slice (mock bridge)", () => {
  before(() => {
    const cfg = defaultConfig();
    cfg.permissionMode = "allow_low_risk";
    cfg.alwaysAllowLowRisk = true;
    cfg.emergencyStop = false;
    cfg.paused = false;
    saveConfig(dataDir, cfg);
  });

  it("Start All → list tabs → read page → click → emergency blocks → Stop All", async () => {
    const sup = new Supervisor({ dataDir, mockBridge: true });
    const start = await sup.startAll();
    assert.equal(start.overall, "ready");
    assert.equal(start.mcp, "running");

    const rt = createRuntime(dataDir, { mockBridge: true });

    const tabs = await rt.byName.get("browser_list_tabs")!.run({});
    assert.equal(tabs.ok, true);

    const page = await rt.byName.get("browser_read_page")!.run({ tabId: 1 });
    assert.equal(page.ok, true);

    const find = await rt.byName.get("browser_find_elements")!.run({ text: "Test Button" });
    assert.equal(find.ok, true);

    const click = await rt.byName.get("browser_click")!.run({
      selector: "#demo-btn",
      confirmed: true,
    });
    assert.equal(click.ok, true);

    // audit should exist
    const logsDir = path.join(dataDir, "logs");
    assert.ok(fs.existsSync(logsDir));

    sup.emergencyStop();
    const blocked = await rt.byName.get("browser_click")!.run({
      selector: "#demo-btn",
      confirmed: true,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error?.code, "EMERGENCY_STOP_ACTIVE");

    sup.clearEmergencyStop();
    const stop = await sup.stopAll();
    assert.equal(stop.mcp, "stopped");
  });

  it("pairs LLM and rejects unauthorized token when connections exist", async () => {
    const cfg = loadConfig(dataDir);
    const { bundle } = pairLlm(cfg, dataDir, projectRoot, "test-client", "grok");
    assert.ok(bundle.token.length > 10);
    assert.ok(bundle.configs.grok.includes("mcpServers"));

    // With connections, missing token fails at MCP layer — simulate auth helper
    const { authenticateToken, loadConfig: lc } = await import("../src/config.ts");
    const c2 = lc(dataDir);
    assert.equal(authenticateToken(c2, "wrong"), null);
    assert.ok(authenticateToken(c2, bundle.token));
  });

  it("blocks unauthorized domain", async () => {
    const cfg = loadConfig(dataDir);
    cfg.allowedDomains = ["example.com"];
    cfg.blockedDomains = [];
    cfg.emergencyStop = false;
    cfg.paused = false;
    cfg.permissionMode = "allow_low_risk";
    cfg.alwaysAllowLowRisk = true;
    // clear connections for tool path
    cfg.connections = [];
    saveConfig(dataDir, cfg);

    const rt = createRuntime(dataDir, { mockBridge: true });
    const res = await rt.byName.get("browser_read_page")!.run({
      tabId: 1,
      url: "https://not-allowed.test/",
    });
    // read_page level 0 still checks domain
    assert.equal(res.ok, false);
    assert.equal(res.error?.code, "PERMISSION_DENIED");
  });
});
