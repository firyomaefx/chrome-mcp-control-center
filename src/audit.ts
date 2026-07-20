import fs from "node:fs";
import path from "node:path";
import { redactSecrets } from "./redact.js";

export interface AuditEvent {
  time: string;
  client?: string;
  website?: string;
  tool: string;
  action?: string;
  permission?: string;
  result: "ok" | "error" | "denied" | "confirm";
  error?: string;
  redacted: boolean;
  detail?: unknown;
}

export class AuditLog {
  constructor(private dataDir: string) {}

  private file(): string {
    const day = new Date().toISOString().slice(0, 10);
    return path.join(this.dataDir, "logs", `audit-${day}.jsonl`);
  }

  write(event: Omit<AuditEvent, "time" | "redacted"> & { time?: string }): void {
    const payload: AuditEvent = {
      ...event,
      time: event.time ?? new Date().toISOString(),
      redacted: true,
      error: event.error ? redactSecrets(event.error) : undefined,
      detail: event.detail !== undefined ? JSON.parse(redactSecrets(JSON.stringify(event.detail))) : undefined,
    };
    fs.appendFileSync(this.file(), JSON.stringify(payload) + "\n", "utf8");
  }

  readRecent(limit = 200): AuditEvent[] {
    const dir = path.join(this.dataDir, "logs");
    if (!fs.existsSync(dir)) return [];
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("audit-") && f.endsWith(".jsonl"))
      .sort()
      .reverse();
    const out: AuditEvent[] = [];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter(Boolean).reverse();
      for (const line of lines) {
        try {
          out.push(JSON.parse(line) as AuditEvent);
        } catch {
          /* skip */
        }
        if (out.length >= limit) return out;
      }
    }
    return out;
  }
}
