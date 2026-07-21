import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { extensionIdFromPrivateKeyPem } from "../src/chrome/extension-id.ts";

describe("extensionIdFromPrivateKeyPem", () => {
  it("returns 32-char a-p id from RSA key", () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const id = extensionIdFromPrivateKeyPem(pem);
    assert.equal(id.length, 32);
    assert.match(id, /^[a-p]{32}$/);
  });

  it("is stable for same key", () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    assert.equal(extensionIdFromPrivateKeyPem(pem), extensionIdFromPrivateKeyPem(pem));
  });
});
