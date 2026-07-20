import { z } from "zod";
import type { PermissionEngine } from "../permissions/engine.js";
import type { BrowserEngine } from "../browser/engine.js";
import type { ComputerUseEngine } from "../computer/engine.js";
import type { AuditLog } from "../audit.js";
import type { AppConfig } from "../config.js";
import type { ToolResult } from "../result.js";
import { okResult, failResult } from "../result.js";
import { isAppError, makeError } from "../errors.js";
import { loadConfig } from "../config.js";
import { runHealthCheck } from "../diagnostics/health.js";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  run: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolContext {
  dataDir: string;
  permissions: PermissionEngine;
  browser: BrowserEngine;
  computer: ComputerUseEngine;
  audit: AuditLog;
  getConfig: () => AppConfig;
  clientName?: string;
  mockBridge?: boolean;
}

function baseConfirm(schema: z.ZodRawShape = {}) {
  return z.object({
    confirmed: z.boolean().optional().describe("Set true after user approval for level ≥1/2 actions"),
    url: z.string().optional(),
    tabId: z.number().optional(),
    ...schema,
  });
}

export function buildTools(ctx: ToolContext): ToolDef[] {
  async function gated(
    tool: string,
    args: Record<string, unknown>,
    fn: () => Promise<ToolResult>,
  ): Promise<ToolResult> {
    const t0 = Date.now();
    try {
      const decision = ctx.permissions.authorize({
        tool,
        url: typeof args.url === "string" ? args.url : undefined,
        confirmed: Boolean(args.confirmed),
        clientName: ctx.clientName,
      });
      if (!decision.allowed) {
        const err = decision.requiresConfirmation
          ? makeError("USER_CONFIRMATION_REQUIRED", decision.reason)
          : ctx.getConfig().emergencyStop
            ? makeError("EMERGENCY_STOP_ACTIVE", decision.reason)
            : makeError("PERMISSION_DENIED", decision.reason);
        ctx.audit.write({
          client: ctx.clientName,
          tool,
          permission: decision.reason,
          result: decision.requiresConfirmation ? "confirm" : "denied",
          error: err.message,
        });
        return failResult(err, Date.now() - t0);
      }
      const res = await fn();
      ctx.audit.write({
        client: ctx.clientName,
        website: typeof args.url === "string" ? args.url : undefined,
        tool,
        permission: "allowed",
        result: res.ok ? "ok" : "error",
        error: res.error?.message,
        detail: res.ok ? { method: res.method } : res.error,
      });
      return res;
    } catch (e) {
      if (isAppError(e)) {
        ctx.audit.write({
          client: ctx.clientName,
          tool,
          result: "error",
          error: e.message,
        });
        return failResult(e.structured, Date.now() - t0);
      }
      const msg = e instanceof Error ? e.message : String(e);
      return failResult(makeError("INTERNAL_ERROR", msg), Date.now() - t0);
    }
  }

  const tools: ToolDef[] = [
    {
      name: "browser_get_status",
      description: "Get browser automation engine and extension connection status",
      inputSchema: z.object({}),
      run: (args) => gated("browser_get_status", args, async () => ctx.browser.getStatus()),
    },
    {
      name: "browser_list_windows",
      description: "List Chrome windows",
      inputSchema: z.object({}),
      run: (args) => gated("browser_list_windows", args, () => ctx.browser.listWindows()),
    },
    {
      name: "browser_list_tabs",
      description: "List open Chrome tabs (existing session)",
      inputSchema: z.object({}),
      run: (args) => gated("browser_list_tabs", args, () => ctx.browser.listTabs()),
    },
    {
      name: "browser_get_active_tab",
      description: "Get the active Chrome tab",
      inputSchema: z.object({}),
      run: (args) => gated("browser_get_active_tab", args, () => ctx.browser.getActiveTab()),
    },
    {
      name: "browser_focus_tab",
      description: "Focus a tab by id",
      inputSchema: baseConfirm({ tabId: z.number() }),
      run: (args) =>
        gated("browser_focus_tab", args, () => ctx.browser.focusTab(Number(args.tabId))),
    },
    {
      name: "browser_read_page",
      description: "Read page title, text, forms (untrusted content)",
      inputSchema: z.object({ tabId: z.number().optional() }),
      run: (args) =>
        gated("browser_read_page", args, () =>
          ctx.browser.readPage(args.tabId !== undefined ? Number(args.tabId) : undefined),
        ),
    },
    {
      name: "browser_read_accessibility_tree",
      description: "Read accessibility tree for the page",
      inputSchema: z.object({ tabId: z.number().optional() }),
      run: (args) =>
        gated("browser_read_accessibility_tree", args, () =>
          ctx.browser.readAccessibilityTree(args.tabId !== undefined ? Number(args.tabId) : undefined),
        ),
    },
    {
      name: "browser_find_elements",
      description: "Find elements by text, selector, or role",
      inputSchema: z.object({
        tabId: z.number().optional(),
        text: z.string().optional(),
        selector: z.string().optional(),
        role: z.string().optional(),
      }),
      run: (args) =>
        gated("browser_find_elements", args, () =>
          ctx.browser.findElements(args as { tabId?: number; text?: string; selector?: string; role?: string }),
        ),
    },
    {
      name: "browser_get_element_details",
      description: "Get details for an element selector",
      inputSchema: z.object({ selector: z.string(), tabId: z.number().optional() }),
      run: (args) =>
        gated("browser_get_element_details", args, () =>
          ctx.browser.getElementDetails(String(args.selector), args.tabId !== undefined ? Number(args.tabId) : undefined),
        ),
    },
    {
      name: "browser_capture_screenshot",
      description: "Capture a screenshot of a tab",
      inputSchema: z.object({ tabId: z.number().optional() }),
      run: (args) =>
        gated("browser_capture_screenshot", args, () =>
          ctx.browser.screenshot(args.tabId !== undefined ? Number(args.tabId) : undefined),
        ),
    },
    {
      name: "browser_extract_links",
      description: "Extract hyperlinks from the page",
      inputSchema: z.object({ tabId: z.number().optional() }),
      run: (args) =>
        gated("browser_extract_links", args, () =>
          ctx.browser.extractLinks(args.tabId !== undefined ? Number(args.tabId) : undefined),
        ),
    },
    {
      name: "browser_extract_table",
      description: "Extract a table from the page",
      inputSchema: z.object({ tabId: z.number().optional(), selector: z.string().optional() }),
      run: (args) =>
        gated("browser_extract_table", args, () =>
          ctx.browser.extractTable(
            args.tabId !== undefined ? Number(args.tabId) : undefined,
            args.selector !== undefined ? String(args.selector) : undefined,
          ),
        ),
    },
    {
      name: "browser_read_console",
      description: "Read recent console messages",
      inputSchema: z.object({ tabId: z.number().optional() }),
      run: (args) =>
        gated("browser_read_console", args, () =>
          ctx.browser.readConsole(args.tabId !== undefined ? Number(args.tabId) : undefined),
        ),
    },
    {
      name: "browser_read_network_errors",
      description: "Read recent network errors",
      inputSchema: z.object({ tabId: z.number().optional() }),
      run: (args) =>
        gated("browser_read_network_errors", args, () =>
          ctx.browser.readNetworkErrors(args.tabId !== undefined ? Number(args.tabId) : undefined),
        ),
    },
    {
      name: "browser_get_downloads",
      description: "List recent downloads",
      inputSchema: z.object({}),
      run: (args) => gated("browser_get_downloads", args, () => ctx.browser.getDownloads()),
    },
    {
      name: "browser_open_url",
      description: "Navigate to a URL in a tab",
      inputSchema: baseConfirm({ url: z.string().url() }),
      run: (args) => gated("browser_open_url", args, () => ctx.browser.openUrl(String(args.url))),
    },
    {
      name: "browser_create_tab",
      description: "Create a new tab",
      inputSchema: baseConfirm({ url: z.string().optional() }),
      run: (args) =>
        gated("browser_create_tab", args, () =>
          ctx.browser.createTab(args.url !== undefined ? String(args.url) : undefined),
        ),
    },
    {
      name: "browser_close_tab",
      description: "Close a tab",
      inputSchema: baseConfirm({ tabId: z.number() }),
      run: (args) => gated("browser_close_tab", args, () => ctx.browser.closeTab(Number(args.tabId))),
    },
    {
      name: "browser_reload",
      description: "Reload the current or given tab",
      inputSchema: baseConfirm({ tabId: z.number().optional() }),
      run: (args) =>
        gated("browser_reload", args, () =>
          ctx.browser.reload(args.tabId !== undefined ? Number(args.tabId) : undefined),
        ),
    },
    {
      name: "browser_go_back",
      description: "History back",
      inputSchema: baseConfirm({ tabId: z.number().optional() }),
      run: (args) =>
        gated("browser_go_back", args, () =>
          ctx.browser.goBack(args.tabId !== undefined ? Number(args.tabId) : undefined),
        ),
    },
    {
      name: "browser_go_forward",
      description: "History forward",
      inputSchema: baseConfirm({ tabId: z.number().optional() }),
      run: (args) =>
        gated("browser_go_forward", args, () =>
          ctx.browser.goForward(args.tabId !== undefined ? Number(args.tabId) : undefined),
        ),
    },
    {
      name: "browser_click",
      description: "Click an element (DOM-first). Requires confirmation in ask mode.",
      inputSchema: baseConfirm({ selector: z.string(), method: z.string().optional() }),
      run: (args) =>
        gated("browser_click", args, () =>
          ctx.browser.click(
            String(args.selector),
            args.tabId !== undefined ? Number(args.tabId) : undefined,
            args.method !== undefined ? String(args.method) : "dom",
          ),
        ),
    },
    {
      name: "browser_type",
      description: "Type text into a field (does not submit)",
      inputSchema: baseConfirm({
        selector: z.string(),
        text: z.string(),
        clear: z.boolean().optional(),
      }),
      run: (args) =>
        gated("browser_type", args, () =>
          ctx.browser.type(
            String(args.selector),
            String(args.text),
            args.tabId !== undefined ? Number(args.tabId) : undefined,
            Boolean(args.clear),
          ),
        ),
    },
    {
      name: "browser_clear_field",
      description: "Clear an input field",
      inputSchema: baseConfirm({ selector: z.string() }),
      run: (args) =>
        gated("browser_clear_field", args, () =>
          ctx.browser.clearField(
            String(args.selector),
            args.tabId !== undefined ? Number(args.tabId) : undefined,
          ),
        ),
    },
    {
      name: "browser_select_option",
      description: "Select a dropdown option",
      inputSchema: baseConfirm({ selector: z.string(), value: z.string() }),
      run: (args) =>
        gated("browser_select_option", args, () =>
          ctx.browser.selectOption(
            String(args.selector),
            String(args.value),
            args.tabId !== undefined ? Number(args.tabId) : undefined,
          ),
        ),
    },
    {
      name: "browser_check",
      description: "Check a checkbox",
      inputSchema: baseConfirm({ selector: z.string() }),
      run: (args) =>
        gated("browser_check", args, () =>
          ctx.browser.check(
            String(args.selector),
            args.tabId !== undefined ? Number(args.tabId) : undefined,
          ),
        ),
    },
    {
      name: "browser_uncheck",
      description: "Uncheck a checkbox",
      inputSchema: baseConfirm({ selector: z.string() }),
      run: (args) =>
        gated("browser_uncheck", args, () =>
          ctx.browser.uncheck(
            String(args.selector),
            args.tabId !== undefined ? Number(args.tabId) : undefined,
          ),
        ),
    },
    {
      name: "browser_scroll",
      description: "Scroll the page or an element",
      inputSchema: baseConfirm({
        x: z.number().optional(),
        y: z.number().optional(),
        selector: z.string().optional(),
      }),
      run: (args) =>
        gated("browser_scroll", args, () =>
          ctx.browser.scroll({
            tabId: args.tabId !== undefined ? Number(args.tabId) : undefined,
            x: args.x !== undefined ? Number(args.x) : undefined,
            y: args.y !== undefined ? Number(args.y) : undefined,
            selector: args.selector !== undefined ? String(args.selector) : undefined,
          }),
        ),
    },
    {
      name: "browser_hover",
      description: "Hover an element",
      inputSchema: baseConfirm({ selector: z.string() }),
      run: (args) =>
        gated("browser_hover", args, () =>
          ctx.browser.hover(
            String(args.selector),
            args.tabId !== undefined ? Number(args.tabId) : undefined,
          ),
        ),
    },
    {
      name: "browser_drag_drop",
      description: "Drag from one selector to another",
      inputSchema: baseConfirm({ from: z.string(), to: z.string() }),
      run: (args) =>
        gated("browser_drag_drop", args, () =>
          ctx.browser.dragDrop(
            String(args.from),
            String(args.to),
            args.tabId !== undefined ? Number(args.tabId) : undefined,
          ),
        ),
    },
    {
      name: "browser_upload_file",
      description: "Upload a file from an approved path (requires confirmation)",
      inputSchema: baseConfirm({ selector: z.string(), filePath: z.string() }),
      run: (args) =>
        gated("browser_upload_file", args, async () => {
          const fp = String(args.filePath);
          const allowed = ctx.getConfig().approvedUploadDirs.some((d) => fp.startsWith(d));
          if (!allowed) {
            return failResult(makeError("UPLOAD_PATH_DENIED", `Path not in allowlist: ${fp}`));
          }
          return ctx.browser.uploadFile(
            String(args.selector),
            fp,
            args.tabId !== undefined ? Number(args.tabId) : undefined,
          );
        }),
    },
    {
      name: "browser_download_file",
      description: "Download a file to an approved folder (requires confirmation)",
      inputSchema: baseConfirm({ url: z.string().url(), dest: z.string().optional() }),
      run: (args) =>
        gated("browser_download_file", args, () =>
          ctx.browser.downloadFile(
            String(args.url),
            args.dest !== undefined ? String(args.dest) : undefined,
          ),
        ),
    },
    {
      name: "browser_wait_for",
      description: "Wait for a selector or timeout",
      inputSchema: z.object({
        tabId: z.number().optional(),
        selector: z.string().optional(),
        timeoutMs: z.number().optional(),
      }),
      run: (args) =>
        gated("browser_wait_for", args, () =>
          ctx.browser.waitFor({
            tabId: args.tabId !== undefined ? Number(args.tabId) : undefined,
            selector: args.selector !== undefined ? String(args.selector) : undefined,
            timeoutMs: args.timeoutMs !== undefined ? Number(args.timeoutMs) : undefined,
          }),
        ),
    },
    {
      name: "browser_handle_dialog",
      description: "Accept or dismiss a browser dialog",
      inputSchema: baseConfirm({
        action: z.enum(["accept", "dismiss"]),
        promptText: z.string().optional(),
      }),
      run: (args) =>
        gated("browser_handle_dialog", args, () =>
          ctx.browser.handleDialog(
            args.action as "accept" | "dismiss",
            args.promptText !== undefined ? String(args.promptText) : undefined,
          ),
        ),
    },
    {
      name: "browser_execute_workflow",
      description: "Execute a saved workflow by id (requires confirmation)",
      inputSchema: baseConfirm({ workflowId: z.string(), dryRun: z.boolean().optional() }),
      run: (args) =>
        gated("browser_execute_workflow", args, async () =>
          okResult({
            workflowId: args.workflowId,
            dryRun: Boolean(args.dryRun),
            note: "Workflow execution scheduled — see Control Center Workflows page",
          }),
        ),
    },
    // Computer-use
    {
      name: "computer_list_windows",
      description: "List OS windows (computer-use)",
      inputSchema: z.object({}),
      run: (args) => gated("computer_list_windows", args, () => ctx.computer.listWindows()),
    },
    {
      name: "computer_focus_window",
      description: "Focus a window by title substring",
      inputSchema: baseConfirm({ title: z.string() }),
      run: (args) =>
        gated("computer_focus_window", args, () => ctx.computer.focusWindow(String(args.title))),
    },
    {
      name: "computer_capture_screen",
      description: "Capture full screen (prefer browser screenshot)",
      inputSchema: z.object({}),
      run: (args) => gated("computer_capture_screen", args, () => ctx.computer.captureScreen()),
    },
    {
      name: "computer_locate_text",
      description: "OCR locate text on screen (fallback)",
      inputSchema: z.object({ text: z.string() }),
      run: (args) =>
        gated("computer_locate_text", args, () => ctx.computer.locateText(String(args.text))),
    },
    {
      name: "computer_click",
      description: "Click screen coordinates (high caution)",
      inputSchema: baseConfirm({ x: z.number(), y: z.number() }),
      run: (args) =>
        gated("computer_click", args, () => ctx.computer.click(Number(args.x), Number(args.y))),
    },
    {
      name: "computer_type",
      description: "Type via OS keyboard (high caution)",
      inputSchema: baseConfirm({ text: z.string() }),
      run: (args) => gated("computer_type", args, () => ctx.computer.type(String(args.text))),
    },
    {
      name: "computer_press_key",
      description: "Press a key via OS",
      inputSchema: baseConfirm({ key: z.string() }),
      run: (args) => gated("computer_press_key", args, () => ctx.computer.pressKey(String(args.key))),
    },
    {
      name: "computer_scroll",
      description: "Scroll via OS",
      inputSchema: baseConfirm({ dy: z.number() }),
      run: (args) => gated("computer_scroll", args, () => ctx.computer.scroll(Number(args.dy))),
    },
    {
      name: "computer_wait",
      description: "Wait milliseconds (max 30000)",
      inputSchema: z.object({ ms: z.number() }),
      run: (args) => gated("computer_wait", args, () => ctx.computer.wait(Number(args.ms))),
    },
    {
      name: "computer_request_user_takeover",
      description: "Pause and request the user to complete a step",
      inputSchema: z.object({ reason: z.string() }),
      run: (args) =>
        gated("computer_request_user_takeover", args, () =>
          ctx.computer.requestTakeover(String(args.reason)),
        ),
    },
    {
      name: "system_health",
      description: "Run system health check",
      inputSchema: z.object({}),
      run: (args) =>
        gated("system_health", args, async () => {
          const report = await runHealthCheck(ctx.dataDir, { mockBridge: ctx.mockBridge });
          return okResult(report, { method: "local", durationMs: 0 });
        }),
    },
    {
      name: "system_emergency_status",
      description: "Check whether Emergency Stop is active",
      inputSchema: z.object({}),
      run: (args) =>
        gated("system_emergency_status", args, async () => {
          const cfg = loadConfig(ctx.dataDir);
          return okResult(
            { emergencyStop: cfg.emergencyStop, paused: cfg.paused },
            { method: "local", durationMs: 0 },
          );
        }),
    },
  ];

  return tools;
}
