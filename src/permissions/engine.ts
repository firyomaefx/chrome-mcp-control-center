import type { AppConfig } from "../config.js";
import { AppError } from "../errors.js";

/** Permission levels per product spec §14 */
export type PermissionLevel = 0 | 1 | 2 | 3;

export type ToolKind =
  | "observe"
  | "reversible"
  | "commitment"
  | "high_risk"
  | "computer"
  | "system";

const TOOL_LEVEL: Record<string, PermissionLevel> = {
  browser_get_status: 0,
  browser_list_windows: 0,
  browser_list_tabs: 0,
  browser_get_active_tab: 0,
  browser_focus_tab: 1,
  browser_read_page: 0,
  browser_read_accessibility_tree: 0,
  browser_find_elements: 0,
  browser_get_element_details: 0,
  browser_capture_screenshot: 0,
  browser_extract_links: 0,
  browser_extract_table: 0,
  browser_read_console: 0,
  browser_read_network_errors: 0,
  browser_get_downloads: 0,
  browser_open_url: 1,
  browser_create_tab: 1,
  browser_close_tab: 1,
  browser_reload: 1,
  browser_go_back: 1,
  browser_go_forward: 1,
  browser_click: 1,
  browser_type: 1,
  browser_clear_field: 1,
  browser_select_option: 1,
  browser_check: 1,
  browser_uncheck: 1,
  browser_scroll: 1,
  browser_hover: 1,
  browser_drag_drop: 1,
  browser_upload_file: 2,
  browser_download_file: 2,
  browser_wait_for: 0,
  browser_handle_dialog: 1,
  browser_execute_workflow: 2,
  browser_submit: 2,
  autofill_detect: 0,
  autofill_preview: 0,
  autofill_fill: 1,
  autofill_submit: 2,
  computer_list_windows: 1,
  computer_focus_window: 1,
  computer_capture_screen: 0,
  computer_locate_text: 0,
  computer_click: 2,
  computer_type: 2,
  computer_press_key: 2,
  computer_scroll: 1,
  computer_wait: 0,
  computer_request_user_takeover: 0,
  system_health: 0,
  system_emergency_status: 0,
};

export interface AuthContext {
  clientName?: string;
  url?: string;
  domain?: string;
  confirmed?: boolean;
  tool: string;
}

export interface AuthDecision {
  allowed: boolean;
  level: PermissionLevel;
  reason: string;
  requiresConfirmation: boolean;
}

function hostFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function domainAllowed(cfg: AppConfig, domain?: string): boolean {
  if (!domain) return true;
  if (cfg.blockedDomains.some((d) => domain === d || domain.endsWith("." + d))) return false;
  if (cfg.allowedDomains.includes("*")) return true;
  return cfg.allowedDomains.some((d) => domain === d || domain.endsWith("." + d));
}

export class PermissionEngine {
  constructor(private getConfig: () => AppConfig) {}

  levelFor(tool: string): PermissionLevel {
    return TOOL_LEVEL[tool] ?? 2;
  }

  authorize(ctx: AuthContext): AuthDecision {
    const cfg = this.getConfig();
    const level = this.levelFor(ctx.tool);
    const domain = ctx.domain ?? hostFromUrl(ctx.url);

    if (cfg.emergencyStop) {
      return {
        allowed: false,
        level,
        reason: "Emergency Stop is active",
        requiresConfirmation: false,
      };
    }
    if (cfg.paused && level > 0) {
      return {
        allowed: false,
        level,
        reason: "Automation is paused",
        requiresConfirmation: false,
      };
    }
    if (level >= 3) {
      return {
        allowed: false,
        level,
        reason: "Level 3 high-risk actions are blocked in MVP",
        requiresConfirmation: false,
      };
    }
    if (!domainAllowed(cfg, domain)) {
      return {
        allowed: false,
        level,
        reason: `Domain not allowed: ${domain}`,
        requiresConfirmation: false,
      };
    }
    if (ctx.tool.startsWith("computer_") && !cfg.computerUseEnabled && level > 0) {
      // allow read/list/takeover even when computer use off
      if (!["computer_list_windows", "computer_capture_screen", "computer_locate_text", "computer_wait", "computer_request_user_takeover"].includes(ctx.tool)) {
        return {
          allowed: false,
          level,
          reason: "Computer-use mode is disabled",
          requiresConfirmation: false,
        };
      }
    }

    const mode = cfg.permissionMode;
    if (mode === "read_only" && level > 0) {
      return {
        allowed: false,
        level,
        reason: "Read-only safety mode",
        requiresConfirmation: false,
      };
    }

    let requiresConfirmation = false;
    if (level >= 2) requiresConfirmation = true;
    if (mode === "ask_before_actions" && level >= 1) requiresConfirmation = true;
    if (mode === "allow_low_risk" && level === 1 && cfg.alwaysAllowLowRisk) requiresConfirmation = false;
    if (mode === "allow_low_risk" && level === 1 && !cfg.alwaysAllowLowRisk) requiresConfirmation = false;

    if (requiresConfirmation && !ctx.confirmed) {
      return {
        allowed: false,
        level,
        reason: "User confirmation required",
        requiresConfirmation: true,
      };
    }

    return { allowed: true, level, reason: "ok", requiresConfirmation: false };
  }

  assert(ctx: AuthContext): AuthDecision {
    const d = this.authorize(ctx);
    if (!d.allowed) {
      if (d.requiresConfirmation) {
        throw new AppError("USER_CONFIRMATION_REQUIRED", d.reason);
      }
      if (this.getConfig().emergencyStop) {
        throw new AppError("EMERGENCY_STOP_ACTIVE", d.reason);
      }
      throw new AppError("PERMISSION_DENIED", d.reason);
    }
    return d;
  }
}

export function toolLevelMap(): Record<string, PermissionLevel> {
  return { ...TOOL_LEVEL };
}
