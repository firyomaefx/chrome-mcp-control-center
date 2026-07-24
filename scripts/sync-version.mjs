#!/usr/bin/env node
/**
 * Sync SemVer from root package.json to all product surfaces.
 * Usage: npm run version:sync
 * Optional: node scripts/sync-version.mjs 1.0.4
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const semverRe = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

const rootPkgPath = path.join(root, "package.json");
const rootPkg = readJson(rootPkgPath);
let version = process.argv[2] || rootPkg.version;

if (!semverRe.test(version)) {
  console.error(`Invalid SemVer: ${version}`);
  process.exit(1);
}

// 1) root package.json
rootPkg.version = version;
writeJson(rootPkgPath, rootPkg);

// 2) VERSION file
fs.writeFileSync(path.join(root, "VERSION"), version + "\n", "utf8");

// 3) desktop package.json
const deskPath = path.join(root, "desktop", "package.json");
const desk = readJson(deskPath);
desk.version = version;
// Structured artifact names (easy to differentiate)
desk.build = desk.build || {};
desk.build.win = desk.build.win || {};
desk.build.win.artifactName = `ChromeMCP-ControlCenter_\${version}_win-x64_Setup.\${ext}`;
desk.build.nsis = desk.build.nsis || {};
desk.build.nsis.artifactName = `ChromeMCP-ControlCenter_\${version}_win-x64_Setup.\${ext}`;
desk.build.portable = desk.build.portable || {};
desk.build.portable.artifactName = `ChromeMCP-ControlCenter_\${version}_win-x64_Portable.\${ext}`;
writeJson(deskPath, desk);

// 4) extension manifest
const extPath = path.join(root, "extension", "manifest.json");
const ext = readJson(extPath);
ext.version = version.split("-")[0]; // Chrome manifest: no prerelease suffix ideally; use numeric triple
// If prerelease, Chrome wants x.y.z — keep base
if (!/^\d+\.\d+\.\d+$/.test(ext.version)) {
  ext.version = version.replace(/-.*$/, "");
}
writeJson(extPath, ext);

// 5) src/version.ts
const versionTs = `/**
 * Single runtime version string — keep in sync via \`npm run version:sync\`.
 * Do not hand-edit elsewhere; source of truth is root package.json.
 */
export const APP_NAME = "Chrome MCP Control Center";
export const APP_ID = "com.chromemcp.controlcenter";
/** SemVer: MAJOR.MINOR.PATCH[-prerelease] */
export const APP_VERSION = ${JSON.stringify(version)};
/** MCP server name (protocol identity) */
export const MCP_SERVER_NAME = "chrome-mcp-control-center";

export function getAppVersion(): string {
  return APP_VERSION;
}

export function getDisplayVersion(): string {
  return \`\${APP_NAME} \${APP_VERSION}\`;
}

/** GitHub-style tag for this version */
export function getReleaseTag(): string {
  return APP_VERSION.startsWith("v") ? APP_VERSION : \`v\${APP_VERSION}\`;
}
`;
fs.writeFileSync(path.join(root, "src", "version.ts"), versionTs, "utf8");

// 6) Summary
const base = version.replace(/-.*$/, "");
console.log(`Version synced: ${version}`);
console.log(`  package.json / desktop / VERSION / extension / src/version.ts`);
console.log(`  GitHub tag:     v${version}`);
console.log(`  Setup:          ChromeMCP-ControlCenter_${version}_win-x64_Setup.exe`);
console.log(`  Portable:       ChromeMCP-ControlCenter_${version}_win-x64_Portable.exe`);
console.log(`  Extension:      ${base}`);
