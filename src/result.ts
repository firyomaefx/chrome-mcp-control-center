import type { StructuredError } from "./errors.js";

export interface ToolResult<T = unknown> {
  ok: boolean;
  tabId?: number | null;
  target?: string | null;
  method?: string | null;
  durationMs: number;
  pageChanges?: string[];
  error?: StructuredError | null;
  recovery?: string | null;
  screenshotRef?: string | null;
  data?: T;
}

export function okResult<T>(data: T, partial: Partial<ToolResult<T>> = {}): ToolResult<T> {
  return {
    ok: true,
    tabId: partial.tabId ?? null,
    target: partial.target ?? null,
    method: partial.method ?? "dom",
    durationMs: partial.durationMs ?? 0,
    pageChanges: partial.pageChanges ?? [],
    error: null,
    recovery: null,
    screenshotRef: partial.screenshotRef ?? null,
    data,
  };
}

export function failResult(error: StructuredError, durationMs = 0): ToolResult {
  return {
    ok: false,
    tabId: null,
    target: null,
    method: null,
    durationMs,
    pageChanges: [],
    error,
    recovery: error.recovery ?? null,
    screenshotRef: null,
    data: null,
  };
}
