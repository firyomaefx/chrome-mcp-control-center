/**
 * In-process bridge between MCP tools and the Chrome extension (via native host IPC).
 * When no extension is connected, mock mode can serve fixtures for tests.
 */

import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { ToolResult } from "../result.js";
import { okResult, failResult } from "../result.js";
import { makeError } from "../errors.js";

export interface TabInfo {
  id: number;
  windowId: number;
  title: string;
  url: string;
  active: boolean;
  status?: string;
}

export interface BridgeCommand {
  id: string;
  type: string;
  payload?: Record<string, unknown>;
}

export interface BridgeResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

const MAX_MESSAGE_BYTES = 1024 * 1024; // 1 MiB

class BrowserBridge extends EventEmitter {
  private connected = false;
  private lastSeen?: string;
  private mock = false;
  private mockTabs: TabInfo[] = [
    {
      id: 1,
      windowId: 1,
      title: "Chrome MCP Demo",
      url: "file:///demo.html",
      active: true,
      status: "complete",
    },
  ];
  private pending = new Map<
    string,
    { resolve: (r: BridgeResponse) => void; timer: NodeJS.Timeout }
  >();
  private seq = 0;

  enableMock(tabs?: TabInfo[]): void {
    this.mock = true;
    this.connected = true;
    this.lastSeen = new Date().toISOString();
    if (tabs) this.mockTabs = tabs;
  }

  setConnected(v: boolean): void {
    this.connected = v;
    this.lastSeen = new Date().toISOString();
    this.emit("connection", v);
  }

  status(): { connected: boolean; lastSeen?: string; mock: boolean } {
    return { connected: this.connected, lastSeen: this.lastSeen, mock: this.mock };
  }

  /** Called by native host when extension sends a message */
  handleExtensionMessage(raw: unknown): BridgeResponse | null {
    if (typeof raw !== "object" || raw === null) return null;
    const msg = raw as Record<string, unknown>;
    if (msg.type === "hello" || msg.type === "heartbeat") {
      this.setConnected(true);
      return { id: String(msg.id ?? "hello"), ok: true, data: { pong: true } };
    }
    if (msg.type === "response" && typeof msg.id === "string") {
      const p = this.pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        p.resolve({
          id: msg.id,
          ok: Boolean(msg.ok),
          data: msg.data,
          error: typeof msg.error === "string" ? msg.error : undefined,
        });
      }
      return null;
    }
    return null;
  }

  async send(type: string, payload: Record<string, unknown> = {}, timeoutMs = 15000): Promise<BridgeResponse> {
    if (this.mock) {
      return this.mockHandle(type, payload);
    }
    if (!this.connected) {
      return {
        id: "none",
        ok: false,
        error: "EXTENSION_NOT_CONNECTED",
      };
    }
    const id = `cmd_${++this.seq}_${Date.now()}`;
    const cmd: BridgeCommand = { id, type, payload };
    const encoded = Buffer.from(JSON.stringify(cmd), "utf8");
    if (encoded.length > MAX_MESSAGE_BYTES) {
      return { id, ok: false, error: "MESSAGE_TOO_LARGE" };
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ id, ok: false, error: "timeout" });
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      this.emit("toExtension", cmd);
    });
  }

  private async mockHandle(type: string, payload: Record<string, unknown>): Promise<BridgeResponse> {
    const id = `mock_${++this.seq}`;
    switch (type) {
      case "list_tabs":
        return { id, ok: true, data: { tabs: this.mockTabs } };
      case "list_windows":
        return { id, ok: true, data: { windows: [{ id: 1, focused: true }] } };
      case "get_active_tab":
        return { id, ok: true, data: { tab: this.mockTabs.find((t) => t.active) ?? this.mockTabs[0] } };
      case "read_page": {
        const tabId = Number(payload.tabId ?? 1);
        return {
          id,
          ok: true,
          data: {
            tabId,
            title: "Chrome MCP Demo",
            url: "file:///demo.html",
            text: "Demo page for Chrome MCP. Click the Test Button.",
            htmlSnippet: "<button id='demo-btn'>Test Button</button>",
            forms: [{ name: "demo", fields: [{ name: "q", type: "text", label: "Query" }] }],
          },
        };
      }
      case "find_elements":
        return {
          id,
          ok: true,
          data: {
            elements: [
              {
                selector: "#demo-btn",
                tag: "button",
                text: "Test Button",
                role: "button",
                interactable: true,
              },
            ],
          },
        };
      case "click":
        return {
          id,
          ok: true,
          data: { clicked: true, selector: payload.selector, method: "dom" },
        };
      case "type":
        return { id, ok: true, data: { typed: true, selector: payload.selector } };
      case "scroll":
        return { id, ok: true, data: { scrolled: true } };
      case "screenshot":
        return { id, ok: true, data: { base64: "", path: null, note: "mock-empty" } };
      case "a11y_tree":
        return {
          id,
          ok: true,
          data: { tree: [{ role: "button", name: "Test Button", selector: "#demo-btn" }] },
        };
      case "open_url":
        return { id, ok: true, data: { tabId: 2, url: payload.url } };
      default:
        return { id, ok: true, data: { type, echo: payload } };
    }
  }
}

export const bridge = new BrowserBridge();

export function getBridgeStatus(): { connected: boolean; lastSeen?: string } {
  const s = bridge.status();
  return { connected: s.connected, lastSeen: s.lastSeen };
}

export async function bridgeCall(
  type: string,
  payload: Record<string, unknown> = {},
): Promise<ToolResult> {
  const t0 = Date.now();
  const res = await bridge.send(type, payload);
  const durationMs = Date.now() - t0;
  if (!res.ok) {
    const code =
      res.error === "EXTENSION_NOT_CONNECTED"
        ? "EXTENSION_NOT_CONNECTED"
        : res.error === "MESSAGE_TOO_LARGE"
          ? "MESSAGE_TOO_LARGE"
          : "INTERNAL_ERROR";
    return failResult(makeError(code, res.error || "Bridge call failed"), durationMs);
  }
  return okResult(res.data, { durationMs, method: "extension" });
}

export function saveScreenshot(dataDir: string, base64: string): string {
  const dir = path.join(dataDir, "screenshots");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `shot-${Date.now()}.png`);
  fs.writeFileSync(file, Buffer.from(base64, "base64"));
  return file;
}
