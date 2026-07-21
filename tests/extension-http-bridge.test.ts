/**
 * Proves the real extension HTTP control plane without loading Chrome:
 * simulated extension client registers, polls, executes, posts results.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startHttpServer } from "../src/mcp/http.ts";
import { bridge } from "../src/browser/bridge.ts";
import { defaultConfig, saveConfig } from "../src/config.ts";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-mcp-ext-"));
let port = 0;
let close: (() => Promise<void>) | undefined;
let stopWorker = false;
let workerDone: Promise<void> = Promise.resolve();

async function jfetch(p: string, init?: RequestInit) {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, init);
  return res.json();
}

describe("extension HTTP bridge (simulated extension)", () => {
  before(async () => {
    const cfg = defaultConfig();
    // Unique port not in extension PORT_CANDIDATES (avoids real Chrome extension racing)
    cfg.httpPort = 39187;
    cfg.emergencyStop = false;
    cfg.paused = false;
    cfg.permissionMode = "allow_low_risk";
    cfg.alwaysAllowLowRisk = true;
    cfg.connections = [];
    saveConfig(dataDir, cfg);
    process.env.CHROME_MCP_DATA_DIR = dataDir;
    delete process.env.CHROME_MCP_MOCK;
    bridge.disableMock();
    const handle = await startHttpServer(dataDir, {
      mockBridge: false,
      projectRoot: path.resolve("."),
    });
    port = handle.port;
    close = handle.close;
    assert.equal(port, 39187);

    stopWorker = false;
    workerDone = (async function extensionWorker() {
      try {
        await jfetch("/extension/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extensionId: "simulatedextensionid012345678901234" }),
        });
        while (!stopWorker) {
          let poll: { command?: { id: string; type: string; payload?: Record<string, unknown> } };
          try {
            poll = await jfetch("/extension/poll?waitMs=200");
          } catch {
            break;
          }
          const cmd = poll.command;
          if (!cmd) continue;
          let data: unknown = { ok: true };
          if (cmd.type === "list_tabs") {
            data = {
              tabs: [
                {
                  id: 42,
                  windowId: 1,
                  title: "Real-ish Tab",
                  url: "https://example.com/",
                  active: true,
                },
              ],
            };
          } else if (cmd.type === "read_page") {
            data = {
              tabId: 42,
              title: "Example Domain",
              url: "https://example.com/",
              text: "Example Domain. This domain is for use in documentation.",
              forms: [],
            };
          } else if (cmd.type === "click") {
            data = { clicked: true, selector: cmd.payload?.selector, method: "dom" };
          } else if (cmd.type === "screenshot") {
            data = {
              base64:
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            };
          }
          try {
            await jfetch("/extension/result", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: cmd.id, ok: true, data }),
            });
          } catch {
            break;
          }
        }
      } catch {
        /* shutdown */
      }
    })();
  });

  after(async () => {
    stopWorker = true;
    if (close) await close();
    await Promise.race([workerDone, new Promise((r) => setTimeout(r, 500))]);
  });

  it("registers extension and reports connected", async () => {
    await new Promise((r) => setTimeout(r, 200));
    const st = await jfetch("/extension/status");
    assert.equal(st.connected, true);
    assert.ok(st.extensionId);
  });

  it("list_tabs via MCP HTTP uses live extension path", async () => {
    await jfetch("/control/start", { method: "POST", body: "{}" });
    const result = await jfetch("/mcp/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "browser_list_tabs", arguments: {} }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.method, "extension");
    assert.equal((result.data as { tabs: unknown[] }).tabs[0].id, 42);
  });

  it("read_page and screenshot via extension", async () => {
    const page = await jfetch("/mcp/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "browser_read_page", arguments: { tabId: 42 } }),
    });
    assert.equal(page.ok, true);
    assert.match(String((page.data as { text: string }).text), /Example Domain/);

    const shot = await jfetch("/mcp/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "browser_capture_screenshot", arguments: {} }),
    });
    assert.equal(shot.ok, true);
  });

  it("click requires confirmation in ask mode; works when confirmed", async () => {
    // set ask mode
    await jfetch("/control/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissionMode: "ask_before_actions" }),
    });
    const denied = await jfetch("/mcp/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "browser_click", arguments: { selector: "#x" } }),
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.error?.code, "USER_CONFIRMATION_REQUIRED");

    const ok = await jfetch("/mcp/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "browser_click",
        arguments: { selector: "#x", confirmed: true },
      }),
    });
    assert.equal(ok.ok, true);
  });

  it("emergency stop blocks next action", async () => {
    await jfetch("/control/emergency", { method: "POST", body: "{}" });
    const blocked = await jfetch("/mcp/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "browser_click",
        arguments: { selector: "#x", confirmed: true },
      }),
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error?.code, "EMERGENCY_STOP_ACTIVE");
    await jfetch("/control/clear-emergency", { method: "POST", body: "{}" });
  });
});
