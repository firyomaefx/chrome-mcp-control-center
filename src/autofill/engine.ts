/**
 * Autofill: detect → preview → fill (separate from submit).
 * Never returns passwords / payment / OTP to the LLM.
 */

import type { ToolResult } from "../result.js";
import { okResult } from "../result.js";

export interface ProfileField {
  key: string;
  label: string;
  value: string;
  sensitive?: boolean;
}

export interface AutofillProfile {
  id: string;
  name: string;
  fields: ProfileField[];
  allowedWebsites: string[];
}

const SENSITIVE_KEYS = new Set(["password", "card_number", "cvv", "otp", "ssn", "secret"]);

export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEYS.has(k) || k.includes("password") || k.includes("cvv") || k.includes("otp");
}

export class AutofillEngine {
  detectForms(pageForms: Array<{ name?: string; fields: Array<{ name: string; type: string; label?: string }> }>): ToolResult {
    return okResult({
      forms: pageForms.map((f, i) => ({
        index: i,
        name: f.name ?? `form_${i}`,
        fields: f.fields.map((field) => ({
          ...field,
          sensitive: isSensitiveKey(field.name) || field.type === "password",
        })),
      })),
    });
  }

  preview(profile: AutofillProfile, fieldNames: string[]): ToolResult {
    const mapping = fieldNames.map((name) => {
      const pf = profile.fields.find((f) => f.key === name || f.label.toLowerCase() === name.toLowerCase());
      if (!pf) return { field: name, value: null, status: "unmapped" };
      if (isSensitiveKey(pf.key) || pf.sensitive) {
        return { field: name, value: "[PROTECTED — not sent to LLM]", status: "protected" };
      }
      return { field: name, value: pf.value, status: "ok" };
    });
    return okResult({
      profileId: profile.id,
      mapping,
      note: "Preview only — call fill after approval. Submit is a separate step.",
    });
  }

  fillPreviewOnlyMessage(): ToolResult {
    return okResult({
      filled: false,
      message: "Fill requires USER_CONFIRMATION and is separated from submit.",
    });
  }
}
