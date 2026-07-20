import { bridge, bridgeCall, saveScreenshot } from "./bridge.js";
import type { ToolResult } from "../result.js";
import { okResult, failResult } from "../result.js";
import { makeError, AppError } from "../errors.js";
import { suspectsPromptInjection } from "../redact.js";

export class BrowserEngine {
  constructor(private dataDir: string) {}

  enableMock(): void {
    bridge.enableMock();
  }

  async listTabs(): Promise<ToolResult> {
    return bridgeCall("list_tabs");
  }

  async listWindows(): Promise<ToolResult> {
    return bridgeCall("list_windows");
  }

  async getActiveTab(): Promise<ToolResult> {
    return bridgeCall("get_active_tab");
  }

  async focusTab(tabId: number): Promise<ToolResult> {
    return bridgeCall("focus_tab", { tabId });
  }

  async readPage(tabId?: number): Promise<ToolResult> {
    const res = await bridgeCall("read_page", { tabId });
    if (res.ok && res.data && typeof res.data === "object") {
      const text = String((res.data as { text?: string }).text ?? "");
      if (suspectsPromptInjection(text)) {
        return failResult(
          makeError(
            "PROMPT_INJECTION_SUSPECTED",
            "Page text contains suspected prompt-injection phrases; treating as untrusted data only.",
          ),
          res.durationMs,
        );
      }
    }
    return res;
  }

  async readAccessibilityTree(tabId?: number): Promise<ToolResult> {
    return bridgeCall("a11y_tree", { tabId });
  }

  async findElements(query: { tabId?: number; text?: string; selector?: string; role?: string }): Promise<ToolResult> {
    return bridgeCall("find_elements", query as Record<string, unknown>);
  }

  async getElementDetails(selector: string, tabId?: number): Promise<ToolResult> {
    return bridgeCall("element_details", { selector, tabId });
  }

  async screenshot(tabId?: number): Promise<ToolResult> {
    const res = await bridgeCall("screenshot", { tabId });
    if (res.ok && res.data && typeof res.data === "object") {
      const b64 = (res.data as { base64?: string }).base64;
      if (b64) {
        const file = saveScreenshot(this.dataDir, b64);
        return okResult({ path: file }, { ...res, screenshotRef: file, durationMs: res.durationMs });
      }
    }
    return res;
  }

  async extractLinks(tabId?: number): Promise<ToolResult> {
    return bridgeCall("extract_links", { tabId });
  }

  async extractTable(tabId?: number, selector?: string): Promise<ToolResult> {
    return bridgeCall("extract_table", { tabId, selector });
  }

  async readConsole(tabId?: number): Promise<ToolResult> {
    return bridgeCall("read_console", { tabId });
  }

  async readNetworkErrors(tabId?: number): Promise<ToolResult> {
    return bridgeCall("read_network_errors", { tabId });
  }

  async getDownloads(): Promise<ToolResult> {
    return bridgeCall("get_downloads", {});
  }

  async openUrl(url: string): Promise<ToolResult> {
    return bridgeCall("open_url", { url });
  }

  async createTab(url?: string): Promise<ToolResult> {
    return bridgeCall("create_tab", { url });
  }

  async closeTab(tabId: number): Promise<ToolResult> {
    return bridgeCall("close_tab", { tabId });
  }

  async reload(tabId?: number): Promise<ToolResult> {
    return bridgeCall("reload", { tabId });
  }

  async goBack(tabId?: number): Promise<ToolResult> {
    return bridgeCall("go_back", { tabId });
  }

  async goForward(tabId?: number): Promise<ToolResult> {
    return bridgeCall("go_forward", { tabId });
  }

  async click(selector: string, tabId?: number, method = "dom"): Promise<ToolResult> {
    // Control priority: DOM first
    const res = await bridgeCall("click", { selector, tabId, method });
    if (!res.ok && method === "dom") {
      // fallback chain stub: a11y then visual then computer (caller)
      const a11y = await bridgeCall("click", { selector, tabId, method: "a11y" });
      if (a11y.ok) return { ...a11y, method: "a11y" };
    }
    return res;
  }

  async type(selector: string, text: string, tabId?: number, clear = false): Promise<ToolResult> {
    return bridgeCall("type", { selector, text, tabId, clear });
  }

  async clearField(selector: string, tabId?: number): Promise<ToolResult> {
    return bridgeCall("clear_field", { selector, tabId });
  }

  async selectOption(selector: string, value: string, tabId?: number): Promise<ToolResult> {
    return bridgeCall("select_option", { selector, value, tabId });
  }

  async check(selector: string, tabId?: number): Promise<ToolResult> {
    return bridgeCall("check", { selector, tabId });
  }

  async uncheck(selector: string, tabId?: number): Promise<ToolResult> {
    return bridgeCall("uncheck", { selector, tabId });
  }

  async scroll(opts: { tabId?: number; x?: number; y?: number; selector?: string }): Promise<ToolResult> {
    return bridgeCall("scroll", opts as Record<string, unknown>);
  }

  async hover(selector: string, tabId?: number): Promise<ToolResult> {
    return bridgeCall("hover", { selector, tabId });
  }

  async dragDrop(from: string, to: string, tabId?: number): Promise<ToolResult> {
    return bridgeCall("drag_drop", { from, to, tabId });
  }

  async uploadFile(selector: string, filePath: string, tabId?: number): Promise<ToolResult> {
    return bridgeCall("upload_file", { selector, filePath, tabId });
  }

  async downloadFile(url: string, dest?: string): Promise<ToolResult> {
    return bridgeCall("download_file", { url, dest });
  }

  async waitFor(opts: { tabId?: number; selector?: string; timeoutMs?: number }): Promise<ToolResult> {
    return bridgeCall("wait_for", opts as Record<string, unknown>);
  }

  async handleDialog(action: "accept" | "dismiss", promptText?: string): Promise<ToolResult> {
    return bridgeCall("handle_dialog", { action, promptText });
  }

  getStatus(): ToolResult {
    const s = bridge.status();
    return okResult(
      {
        connected: s.connected,
        mock: s.mock,
        lastSeen: s.lastSeen,
        controlPriority: [
          "accessible_dom",
          "stable_selector",
          "text_label",
          "a11y_tree",
          "cdp",
          "screenshot_visual",
          "computer_use",
        ],
      },
      { method: "local", durationMs: 0 },
    );
  }
}

export function assertOk(res: ToolResult): void {
  if (!res.ok) {
    const code = res.error?.code ?? "INTERNAL_ERROR";
    throw new AppError(code, res.error?.message ?? "Browser operation failed");
  }
}
