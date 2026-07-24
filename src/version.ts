/**
 * Single runtime version string — keep in sync via `npm run version:sync`.
 * Do not hand-edit elsewhere; source of truth is root package.json.
 */
export const APP_NAME = "Chrome MCP Control Center";
export const APP_ID = "com.chromemcp.controlcenter";
/** SemVer: MAJOR.MINOR.PATCH[-prerelease] */
export const APP_VERSION = "1.0.3";
/** MCP server name (protocol identity) */
export const MCP_SERVER_NAME = "chrome-mcp-control-center";

export function getAppVersion(): string {
  return APP_VERSION;
}

export function getDisplayVersion(): string {
  return `${APP_NAME} ${APP_VERSION}`;
}

/** GitHub-style tag for this version */
export function getReleaseTag(): string {
  return APP_VERSION.startsWith("v") ? APP_VERSION : `v${APP_VERSION}`;
}
