/**
 * Pack staged extension to CRX using Chrome's --pack-extension (still supported).
 * Keeps a stable PEM key under dataDir so extension ID never changes.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { findChromePath } from "../diagnostics/windows.js";
import { extensionIdFromKeyFile } from "./extension-id.js";

export interface PackResult {
  crxPath: string;
  keyPath: string;
  extensionId: string;
  version: string;
}

function readVersion(manifestPath: string): string {
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { version?: string };
    return m.version || "1.0.0";
  } catch {
    return "1.0.0";
  }
}

/**
 * Ensure key exists: first pack without key generates pem next to folder; we relocate it.
 */
export function packExtensionCrx(dataDir: string, stagedExtDir: string): PackResult {
  const chrome = findChromePath();
  if (!chrome) throw new Error("CHROME_NOT_FOUND");

  const outDir = path.join(dataDir, "crx");
  fs.mkdirSync(outDir, { recursive: true });
  const keyPath = path.join(outDir, "extension.pem");
  const crxPath = path.join(outDir, "chrome-mcp.crx");

  // Inject update_url into staged manifest for force-install / updates
  const manifestPath = path.join(stagedExtDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const port = Number(process.env.CHROME_MCP_HTTP_PORT || 18787);
  manifest.update_url = `http://127.0.0.1:${port}/extension/update.xml`;
  // Avoid service worker module type issues with packed builds if any
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  const version = readVersion(manifestPath);

  // Chrome writes <foldername>.crx and optionally .pem next to the extension folder's parent
  // Use a temp copy name "ext" under outDir for clean outputs
  const packDir = path.join(outDir, "pack-src");
  fs.rmSync(packDir, { recursive: true, force: true });
  fs.cpSync(stagedExtDir, packDir, { recursive: true });

  const args = [`--pack-extension=${packDir}`];
  if (fs.existsSync(keyPath)) {
    args.push(`--pack-extension-key=${keyPath}`);
  }

  try {
    execFileSync(chrome, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      timeout: 60000,
    });
  } catch (e) {
    // Chrome pack often exits non-zero even on success; check outputs
    const msg = e instanceof Error ? e.message : String(e);
    if (!fs.existsSync(path.join(outDir, "pack-src.crx")) && !fs.existsSync(packDir + ".crx")) {
      throw new Error(`Chrome pack-extension failed: ${msg}`);
    }
  }

  // Chrome places pack-src.crx next to pack-src folder (inside outDir)
  const producedCrx = path.join(outDir, "pack-src.crx");
  const producedPem = path.join(outDir, "pack-src.pem");
  const altCrx = packDir + ".crx";
  const altPem = packDir + ".pem";

  const foundCrx = fs.existsSync(producedCrx) ? producedCrx : fs.existsSync(altCrx) ? altCrx : null;
  if (!foundCrx) {
    throw new Error("CRX not produced by Chrome pack-extension");
  }
  fs.copyFileSync(foundCrx, crxPath);

  if (!fs.existsSync(keyPath)) {
    const foundPem = fs.existsSync(producedPem) ? producedPem : fs.existsSync(altPem) ? altPem : null;
    if (!foundPem) throw new Error("PEM key not produced — cannot stabilize extension ID");
    fs.copyFileSync(foundPem, keyPath);
  }

  // cleanup intermediate
  try {
    if (fs.existsSync(producedCrx)) fs.unlinkSync(producedCrx);
    if (fs.existsSync(producedPem)) fs.unlinkSync(producedPem);
    if (fs.existsSync(altCrx)) fs.unlinkSync(altCrx);
    if (fs.existsSync(altPem)) fs.unlinkSync(altPem);
  } catch {
    /* ignore */
  }

  const extensionId = extensionIdFromKeyFile(keyPath);
  return { crxPath, keyPath, extensionId, version };
}

export function writeUpdateXml(
  dataDir: string,
  extensionId: string,
  version: string,
  port: number,
  crxPath?: string,
): { xmlPath: string; updateUrlHttp: string; updateUrlFile: string } {
  const outDir = path.join(dataDir, "crx");
  fs.mkdirSync(outDir, { recursive: true });
  const xmlPath = path.join(outDir, "update.xml");
  const resolvedCrx = crxPath || path.join(outDir, "chrome-mcp.crx");
  // Prefer file:// codebase so force-install works even if HTTP is briefly down
  const codebaseFile = pathToFileURL(resolvedCrx).href;
  const codebaseHttp = `http://127.0.0.1:${port}/extension/chrome-mcp.crx`;
  const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${extensionId}'>
    <updatecheck codebase='${codebaseFile}' version='${version}' />
  </app>
</gupdate>
`;
  fs.writeFileSync(xmlPath, xml, "utf8");
  // Also write http-oriented copy for loopback hosting
  fs.writeFileSync(
    path.join(outDir, "update-http.xml"),
    xml.replace(codebaseFile, codebaseHttp),
    "utf8",
  );
  return {
    xmlPath,
    updateUrlHttp: `http://127.0.0.1:${port}/extension/update.xml`,
    updateUrlFile: pathToFileURL(xmlPath).href,
  };
}
