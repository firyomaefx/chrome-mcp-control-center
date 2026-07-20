import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ComputerUseEngine } from "../src/computer/engine.ts";

describe("ComputerUseEngine", () => {
  it("blocks click when disabled", async () => {
    const eng = new ComputerUseEngine(false, ".");
    const r = await eng.click(10, 10);
    assert.equal(r.ok, false);
    assert.equal(r.error?.code, "COMPUTER_USE_UNAVAILABLE");
  });

  it("simulates click when enabled without ALLOW_INPUT", async () => {
    delete process.env.CHROME_MCP_ALLOW_INPUT;
    const eng = new ComputerUseEngine(true, ".");
    const r = await eng.click(10, 20);
    assert.equal(r.ok, true);
    assert.equal((r.data as { simulated?: boolean }).simulated, true);
  });

  it("request takeover always available", async () => {
    const eng = new ComputerUseEngine(false, ".");
    const r = await eng.requestTakeover("CAPTCHA");
    assert.equal(r.ok, true);
    assert.equal((r.data as { takeover: boolean }).takeover, true);
  });

  it("list windows works as fallback scenario on Windows", async () => {
    const eng = new ComputerUseEngine(true, ".");
    const r = await eng.listWindows();
    assert.equal(r.ok, true);
    assert.ok(r.data);
  });
});
