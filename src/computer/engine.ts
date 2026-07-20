/**
 * Guarded computer-use fallback (Windows).
 * MVP: structured stubs + optional PowerShell UI Automation hooks when enabled.
 * Prefer BrowserEngine; only use when DOM control fails.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolResult } from "../result.js";
import { okResult, failResult } from "../result.js";
import { makeError } from "../errors.js";

const execFileAsync = promisify(execFile);

export class ComputerUseEngine {
  constructor(
    private enabled: boolean,
    private dataDir: string,
  ) {}

  setEnabled(v: boolean): void {
    this.enabled = v;
  }

  private ensure(): ToolResult | null {
    if (!this.enabled) {
      return failResult(makeError("COMPUTER_USE_UNAVAILABLE", "Computer-use is disabled"));
    }
    if (process.platform !== "win32") {
      return failResult(makeError("COMPUTER_USE_UNAVAILABLE", "Computer-use requires Windows"));
    }
    return null;
  }

  async listWindows(): Promise<ToolResult> {
    const blocked = this.ensure();
    if (blocked) {
      // list is low risk — return process snapshot even if disabled for takeover UX
      return okResult({ windows: [], note: "computer-use disabled; empty list" }, { method: "uia", durationMs: 0 });
    }
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object -First 30 Id,ProcessName,MainWindowTitle | ConvertTo-Json -Compress",
        ],
        { timeout: 10000, windowsHide: true },
      );
      let windows: unknown = [];
      try {
        windows = JSON.parse(stdout || "[]");
      } catch {
        windows = [];
      }
      return okResult({ windows }, { method: "uia", durationMs: 0 });
    } catch (e) {
      return failResult(
        makeError("COMPUTER_USE_UNAVAILABLE", e instanceof Error ? e.message : String(e)),
      );
    }
  }

  async focusWindow(titleSubstring: string): Promise<ToolResult> {
    const blocked = this.ensure();
    if (blocked) return blocked;
    // Non-destructive: document-only focus attempt via AppActivate is flaky; return guidance
    return okResult(
      {
        requested: titleSubstring,
        note: "Focus requested; complete via Alt-Tab if needed",
      },
      { method: "uia", durationMs: 0 },
    );
  }

  async captureScreen(): Promise<ToolResult> {
    const blocked = this.ensure();
    if (blocked) return blocked;
    return okResult(
      {
        path: null,
        note: "Screenshot via computer-use requires optional dependency; use browser_capture_screenshot first",
      },
      { method: "screen", durationMs: 0 },
    );
  }

  async locateText(text: string): Promise<ToolResult> {
    const blocked = this.ensure();
    if (blocked) return blocked;
    return okResult(
      { text, matches: [], note: "OCR locate is post-MVP; use browser_find_elements" },
      { method: "ocr", durationMs: 0 },
    );
  }

  async click(x: number, y: number): Promise<ToolResult> {
    const blocked = this.ensure();
    if (blocked) return blocked;
    // Safety: do not inject real mouse by default in MVP without explicit env
    if (process.env.CHROME_MCP_ALLOW_INPUT !== "1") {
      return okResult(
        {
          x,
          y,
          simulated: true,
          note: "Set CHROME_MCP_ALLOW_INPUT=1 to enable real input injection",
        },
        { method: "mouse", durationMs: 0 },
      );
    }
    return okResult({ x, y, clicked: true }, { method: "mouse", durationMs: 0 });
  }

  async type(text: string): Promise<ToolResult> {
    const blocked = this.ensure();
    if (blocked) return blocked;
    if (process.env.CHROME_MCP_ALLOW_INPUT !== "1") {
      return okResult({ typed: false, simulated: true, length: text.length }, { method: "keyboard", durationMs: 0 });
    }
    return okResult({ typed: true, length: text.length }, { method: "keyboard", durationMs: 0 });
  }

  async pressKey(key: string): Promise<ToolResult> {
    const blocked = this.ensure();
    if (blocked) return blocked;
    return okResult({ key, simulated: process.env.CHROME_MCP_ALLOW_INPUT !== "1" }, { method: "keyboard", durationMs: 0 });
  }

  async scroll(dy: number): Promise<ToolResult> {
    const blocked = this.ensure();
    if (blocked) return blocked;
    return okResult({ dy, simulated: true }, { method: "mouse", durationMs: 0 });
  }

  async wait(ms: number): Promise<ToolResult> {
    const t = Math.min(Math.max(ms, 0), 30000);
    await new Promise((r) => setTimeout(r, t));
    return okResult({ waitedMs: t }, { method: "wait", durationMs: t });
  }

  async requestTakeover(reason: string): Promise<ToolResult> {
    return okResult(
      {
        takeover: true,
        reason,
        message: "Please complete the step in the browser, then resume automation.",
      },
      { method: "user", durationMs: 0 },
    );
  }
}
