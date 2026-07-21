/**
 * Sensitive-data protection for cloud sync payloads.
 * Never sync passwords, cookies, tokens, API keys, cards, bank info, private keys.
 */

import { redactSecrets } from "../redact.js";

const SENSITIVE_FIELD_HINTS = [
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "cookie",
  "session",
  "otp",
  "mfa",
  "2fa",
  "cvv",
  "cvc",
  "card",
  "credit",
  "debit",
  "iban",
  "routing",
  "ssn",
  "api_key",
  "apikey",
  "authorization",
  "auth_code",
  "private_key",
  "privatekey",
];

const CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi;

export interface RedactedField {
  field_type: string;
  value: "[REDACTED]";
  character_count: number;
}

export function isSensitiveFieldName(name: string): boolean {
  const n = name.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return SENSITIVE_FIELD_HINTS.some((h) => n.includes(h));
}

export function redactSensitiveValue(fieldType: string, value: unknown): RedactedField {
  const s = value == null ? "" : String(value);
  return {
    field_type: fieldType || "sensitive",
    value: "[REDACTED]",
    character_count: s.length,
  };
}

/** Deep-clone and redact objects for cloud upload. */
export function sanitizeForCloud(input: unknown, depth = 0): unknown {
  if (depth > 12) return "[TRUNCATED]";
  if (input == null) return input;
  if (typeof input === "string") {
    let s = redactSecrets(input);
    s = s.replace(CARD_RE, "[REDACTED_CARD]");
    s = s.replace(IBAN_RE, "[REDACTED_IBAN]");
    // Never send long page dumps of secrets
    if (s.length > 4000) s = s.slice(0, 4000) + "…[truncated]";
    return s;
  }
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (Array.isArray(input)) return input.map((x) => sanitizeForCloud(x, depth + 1));
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (isSensitiveFieldName(k)) {
        out[k] = redactSensitiveValue(k, v);
        continue;
      }
      // Strip cookie/session blobs by key
      if (/cookie|set-cookie|authorization/i.test(k)) {
        out[k] = redactSensitiveValue(k, v);
        continue;
      }
      out[k] = sanitizeForCloud(v, depth + 1);
    }
    return out;
  }
  return String(input);
}

/** Domain only from URL */
export function domainFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/** Normalize free-text task into short objective (no secrets). */
export function normalizeObjective(prompt: string): string {
  const clean = String(sanitizeForCloud(prompt) || "");
  const one = clean.replace(/\s+/g, " ").trim();
  return one.length > 280 ? one.slice(0, 280) + "…" : one;
}
