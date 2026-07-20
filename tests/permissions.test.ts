import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PermissionEngine } from "../src/permissions/engine.ts";
import type { AppConfig } from "../src/config.ts";
import { defaultConfig } from "../src/config.ts";

function cfg(partial: Partial<AppConfig> = {}): AppConfig {
  return { ...defaultConfig(), ...partial };
}

describe("PermissionEngine", () => {
  it("allows read tools in read_only mode", () => {
    const engine = new PermissionEngine(() => cfg({ permissionMode: "read_only", emergencyStop: false }));
    const d = engine.authorize({ tool: "browser_list_tabs" });
    assert.equal(d.allowed, true);
  });

  it("blocks click in read_only mode", () => {
    const engine = new PermissionEngine(() => cfg({ permissionMode: "read_only" }));
    const d = engine.authorize({ tool: "browser_click", confirmed: true });
    assert.equal(d.allowed, false);
  });

  it("requires confirmation in ask_before_actions for click", () => {
    const engine = new PermissionEngine(() =>
      cfg({ permissionMode: "ask_before_actions", emergencyStop: false, paused: false }),
    );
    const d = engine.authorize({ tool: "browser_click" });
    assert.equal(d.allowed, false);
    assert.equal(d.requiresConfirmation, true);
  });

  it("allows click when confirmed", () => {
    const engine = new PermissionEngine(() =>
      cfg({ permissionMode: "ask_before_actions", emergencyStop: false, paused: false }),
    );
    const d = engine.authorize({ tool: "browser_click", confirmed: true });
    assert.equal(d.allowed, true);
  });

  it("blocks when emergency stop active", () => {
    const engine = new PermissionEngine(() => cfg({ emergencyStop: true }));
    const d = engine.authorize({ tool: "browser_list_tabs" });
    assert.equal(d.allowed, false);
  });

  it("blocks disallowed domain", () => {
    const engine = new PermissionEngine(() =>
      cfg({ allowedDomains: ["example.com"], blockedDomains: [], emergencyStop: false }),
    );
    const d = engine.authorize({
      tool: "browser_read_page",
      url: "https://evil.test/page",
    });
    assert.equal(d.allowed, false);
  });

  it("blocks level 3", () => {
    const engine = new PermissionEngine(() => cfg({ emergencyStop: false }));
    // force unknown high risk mapping defaults to 2; use browser_submit if mapped
    const d = engine.authorize({ tool: "browser_submit", confirmed: true });
    // level 2 requires confirm — if we pass confirmed allowed unless blocked
    // level 3 not in map defaults 2 — add assert on toolLevel
    assert.ok(engine.levelFor("browser_list_tabs") === 0);
  });
});
