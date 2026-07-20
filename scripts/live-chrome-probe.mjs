/**
 * Live Chrome probe (optional): verifies Chrome binary exists and prints
 * load-unpacked instructions. Full extension automation requires user load
 * of unpacked extension (Chrome security).
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  process.env.CHROME_PATH,
  path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
  path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
  path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
].filter(Boolean);

const chrome = candidates.find((c) => fs.existsSync(c));
const ext = path.join(root, "extension");

const report = {
  chromeFound: Boolean(chrome),
  chromePath: chrome || null,
  extensionPath: ext,
  extensionExists: fs.existsSync(path.join(ext, "manifest.json")),
  instructions: [
    "1. Start Control Center or: node dist/cli.js serve-http",
    "2. Chrome → chrome://extensions → Developer mode → Load unpacked",
    `3. Select: ${ext}`,
    "4. Extension registers to http://127.0.0.1:18787 automatically",
    "5. Control Center → Start All → status Ready when extension connected",
  ],
};

console.log(JSON.stringify(report, null, 2));
process.exit(chrome && report.extensionExists ? 0 : 1);
