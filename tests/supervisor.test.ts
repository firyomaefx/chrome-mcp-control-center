import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Supervisor } from "../src/supervisor/supervisor.ts";
import { defaultConfig, saveConfig } from "../src/config.ts";

describe("Supervisor", () => {
  it("emergency stop requires explicit clear before resume", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-mcp-sup-"));
    saveConfig(dataDir, defaultConfig());
    const sup = new Supervisor({ dataDir, mockBridge: true });
    await sup.startAll();
    sup.emergencyStop();
    assert.equal(sup.getState().emergencyStop, true);
    assert.throws(() => sup.resume());
    sup.clearEmergencyStop();
    // still paused after emergency
    assert.equal(sup.getConfig().paused, true);
    const r = sup.resume();
    assert.equal(r.paused, false);
  });
});
