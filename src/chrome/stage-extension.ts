/**
 * Stage the Chrome extension into a stable, writable path for --load-extension.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function defaultSourceExtensionDir(): string {
  // Packaged Electron may set CHROME_MCP_EXTENSION_SRC
  if (process.env.CHROME_MCP_EXTENSION_SRC && fs.existsSync(process.env.CHROME_MCP_EXTENSION_SRC)) {
    return process.env.CHROME_MCP_EXTENSION_SRC;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/chrome -> ../../extension
  const fromDist = path.resolve(here, "..", "..", "extension");
  if (fs.existsSync(path.join(fromDist, "manifest.json"))) return fromDist;
  // src/chrome during tsx
  const fromSrc = path.resolve(here, "..", "..", "extension");
  if (fs.existsSync(path.join(fromSrc, "manifest.json"))) return fromSrc;
  return fromDist;
}

export function stagedExtensionDir(dataDir: string): string {
  return path.join(dataDir, "extension");
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * Copy extension sources into dataDir/extension. Idempotent.
 */
export function stageExtension(
  dataDir: string,
  sourceDir = defaultSourceExtensionDir(),
): { stagedPath: string; sourceDir: string; copied: boolean } {
  const stagedPath = stagedExtensionDir(dataDir);
  if (!fs.existsSync(path.join(sourceDir, "manifest.json"))) {
    throw new Error(`Extension source not found: ${sourceDir}`);
  }
  copyDir(sourceDir, stagedPath);
  // Write runtime port hint for extension (background reads via fetch first; optional file for diagnostics)
  const port = Number(process.env.CHROME_MCP_HTTP_PORT || 18787);
  fs.writeFileSync(
    path.join(stagedPath, "runtime-hint.json"),
    JSON.stringify({ httpPort: port, updatedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dataDir, "http-port.json"),
    JSON.stringify({ httpPort: port }, null, 2),
    "utf8",
  );
  return { stagedPath, sourceDir, copied: true };
}
