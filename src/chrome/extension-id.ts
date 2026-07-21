/**
 * Chrome extension ID from RSA public key (a-p encoding of first 16 bytes of SHA-256(SPKI)).
 */

import crypto from "node:crypto";
import fs from "node:fs";

export function extensionIdFromPrivateKeyPem(pem: string): string {
  const keyObject = crypto.createPrivateKey(pem);
  const publicKey = crypto.createPublicKey(keyObject);
  const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const hash = crypto.createHash("sha256").update(spki).digest();
  const bytes = hash.subarray(0, 16);
  let id = "";
  for (const b of bytes) {
    id += String.fromCharCode(97 + ((b >> 4) & 0xf));
    id += String.fromCharCode(97 + (b & 0xf));
  }
  return id;
}

export function extensionIdFromKeyFile(keyPath: string): string {
  const pem = fs.readFileSync(keyPath, "utf8");
  return extensionIdFromPrivateKeyPem(pem);
}
