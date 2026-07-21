import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sanitizeForCloud, redactSensitiveValue, isSensitiveFieldName } from "../src/cloud/redact-payload.ts";
import { LocalCloudStore } from "../src/cloud/local-store.ts";
import { TelemetryService } from "../src/cloud/telemetry.ts";
import { CONSENT_VERSION } from "../src/cloud/types.ts";

describe("cloud redaction", () => {
  it("redacts password fields to structured placeholder", () => {
    const out = sanitizeForCloud({
      username: "alice",
      password: "s3cret!!",
      note: "ok",
    }) as Record<string, unknown>;
    assert.equal(out.username, "alice");
    assert.deepEqual(out.password, {
      field_type: "password",
      value: "[REDACTED]",
      character_count: 8,
    });
  });

  it("detects sensitive field names", () => {
    assert.equal(isSensitiveFieldName("api_key"), true);
    assert.equal(isSensitiveFieldName("cardNumber"), true);
    assert.equal(isSensitiveFieldName("title"), false);
  });

  it("redactSensitiveValue includes character_count", () => {
    const r = redactSensitiveValue("password", "abcdefghijklmn");
    assert.equal(r.character_count, 14);
    assert.equal(r.value, "[REDACTED]");
  });
});

describe("local store + telemetry free scope", () => {
  let dataDir: string;
  let tel: TelemetryService;

  before(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-mcp-cloud-"));
    tel = new TelemetryService(dataDir);
  });

  it("does not enqueue without consent", () => {
    tel.trackToolCall("browser_click", { selector: "#x" }, { ok: true }, true, 10);
    assert.equal(tel.getStore().listQueue().length, 0);
  });

  it("after consent enqueues free ops and keeps local history", () => {
    tel.acceptConsent("free");
    assert.equal(tel.hasConsent(), true);
    assert.equal(tel.getStore().getConsent().version, CONSENT_VERSION);

    tel.trackTaskPrompt("Open example.com and click Login");
    tel.trackToolCall("browser_click", { selector: "#login", password: "nope" }, { ok: false, error: { code: "X" } }, false, 5);
    tel.trackRecovery(1, "retry_selector", false);

    const q = tel.getStore().listQueue(50);
    assert.ok(q.length >= 3);
    const hist = tel.getStore().readHistory(50);
    assert.ok(hist.length >= 3);

    // password arg redacted in payload
    const failed = q.find((i) => i.record.kind === "failed_action");
    assert.ok(failed);
    const args = failed!.record.payload.args as Record<string, unknown>;
    assert.equal((args.password as { value: string }).value, "[REDACTED]");
  });

  it("free plan drops paid-only kinds", () => {
    const before = tel.getStore().listQueue().length;
    tel.trackAiResponse("claude", "hello world");
    const after = tel.getStore().listQueue().length;
    assert.equal(after, before);
  });

  it("paid plan allows ai_response", () => {
    tel.acceptConsent("paid");
    const before = tel.getStore().listQueue().length;
    tel.trackAiResponse("codex", "response text");
    const after = tel.getStore().listQueue().length;
    assert.ok(after > before);
  });

  it("dedupes clientEventId", () => {
    const store = new LocalCloudStore(dataDir);
    const rec = {
      recordId: "r1",
      clientEventId: "same-id",
      userId: "u",
      deviceId: "d",
      plan: "free" as const,
      kind: "usage_metric" as const,
      createdAt: new Date().toISOString(),
      payload: { metric: "x", value: 1 },
    };
    const a = store.appendLocalAndEnqueue(rec);
    const b = store.appendLocalAndEnqueue(rec);
    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, true);
  });
});
