#!/usr/bin/env node
/**
 * Fail if the repo is not portable for another Windows PC.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bad = [];
const warn = [];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name === "release" || ent.name === ".git")
      continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

// 1) No Pedot home paths in runtime sources
const runtimeRoots = ["src", "desktop", "extension", "cloud-backend", "scripts"].map((d) =>
  path.join(root, d),
);
const re = /C:[/\\]Users[/\\]Pedot/i;
for (const r of runtimeRoots) {
  for (const f of walk(r)) {
    if (!/\.(ts|js|mjs|json|html|css|cmd)$/i.test(f)) continue;
    if (f.endsWith("package-lock.json")) continue;
    const text = fs.readFileSync(f, "utf8");
    if (re.test(text)) bad.push(`hardcoded user path: ${path.relative(root, f)}`);
  }
}

// 2) samples must not use Pedot absolute paths
for (const f of walk(path.join(root, "samples"))) {
  const text = fs.readFileSync(f, "utf8");
  if (re.test(text)) bad.push(`sample has user path: ${path.relative(root, f)}`);
}

// 3) required layout
for (const rel of [
  "package.json",
  "extension/manifest.json",
  "extension/background.js",
  "desktop/main.js",
  "desktop/package.json",
  "src/cli.ts",
  "cloud-backend/server.mjs",
]) {
  if (!fs.existsSync(path.join(root, rel))) bad.push(`missing ${rel}`);
}

// 4) obsidian export soft-skip (spawn with fake vault)
{
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "obsidian-export.mjs")], {
    env: { ...process.env, OBSIDIAN_VAULT: path.join(root, ".no-such-vault") },
    encoding: "utf8",
  });
  if (r.status !== 0) {
    bad.push(`obsidian-export must exit 0 without vault (got ${r.status}): ${r.stderr || r.stdout}`);
  }
}

// 5) package engines
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const eng = pkg.engines?.node || "";
if (!eng.includes("20")) warn.push(`engines.node should require >=20 (have ${eng})`);

// 6) desktop version alignment
const desk = JSON.parse(fs.readFileSync(path.join(root, "desktop", "package.json"), "utf8"));
if (desk.version !== pkg.version) {
  bad.push(`version skew root=${pkg.version} desktop=${desk.version}`);
}

if (warn.length) {
  console.warn("Warnings:\n" + warn.map((w) => `  - ${w}`).join("\n"));
}
if (bad.length) {
  console.error("Portability smoke FAILED:\n" + bad.map((b) => `  - ${b}`).join("\n"));
  process.exit(1);
}
console.log("Portability smoke OK — safe for clean Windows clone / package.");
