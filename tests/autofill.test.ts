import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AutofillEngine, isSensitiveKey } from "../src/autofill/engine.ts";

describe("AutofillEngine", () => {
  it("marks password fields sensitive on detect", () => {
    const engine = new AutofillEngine();
    const r = engine.detectForms([
      {
        name: "login",
        fields: [
          { name: "email", type: "text", label: "Email" },
          { name: "password", type: "password", label: "Password" },
        ],
      },
    ]);
    assert.equal(r.ok, true);
    const fields = (r.data as { forms: Array<{ fields: Array<{ sensitive: boolean; name: string }> }> }).forms[0]
      .fields;
    assert.equal(fields.find((f) => f.name === "password")?.sensitive, true);
  });

  it("preview never returns password values to LLM", () => {
    const engine = new AutofillEngine();
    const r = engine.preview(
      {
        id: "p1",
        name: "me",
        allowedWebsites: ["*"],
        fields: [
          { key: "email", label: "Email", value: "a@b.com" },
          { key: "password", label: "Password", value: "s3cret!", sensitive: true },
        ],
      },
      ["email", "password"],
    );
    assert.equal(r.ok, true);
    const mapping = (r.data as { mapping: Array<{ field: string; value: string | null }> }).mapping;
    assert.equal(mapping.find((m) => m.field === "email")?.value, "a@b.com");
    assert.match(String(mapping.find((m) => m.field === "password")?.value), /PROTECTED/);
    assert.equal(String(mapping.find((m) => m.field === "password")?.value).includes("s3cret"), false);
  });

  it("isSensitiveKey catches otp and cvv", () => {
    assert.equal(isSensitiveKey("otp"), true);
    assert.equal(isSensitiveKey("card_cvv"), true);
    assert.equal(isSensitiveKey("full_name"), false);
  });
});
