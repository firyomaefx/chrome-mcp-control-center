#!/usr/bin/env node
/**
 * Export project docs into Obsidian TTRG vault (10-Projects/chrome-mcp-control-center).
 * - Clean Markdown + internal wikilinks
 * - Redacts secrets (passwords, tokens, keys, credentials)
 * - Skips private logs, pairing tokens, data dirs
 *
 * Usage: node scripts/obsidian-export.mjs
 * Config: knowledge-bridge config or env OBSIDIAN_VAULT / CHROME_MCP_OBSIDIAN_PROJECT
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_VAULT = "C:\\Users\\Pedot\\OneDrive\\Obsidian\\TTRG";
const PROJECT_SLUG = "chrome-mcp-control-center";

const REDACT_PATTERNS = [
  /password["\s:=]+[^\s"',}\]]+/gi,
  /api[_-]?key["\s:=]+[^\s"',}\]]+/gi,
  /bearer\s+[a-z0-9\-._~+/]+=*/gi,
  /sk-[a-z0-9]{10,}/gi,
  /token["\s:=]+[^\s"',}\]]{8,}/gi,
  /CHROME_MCP_TOKEN["\s:=]+[^\s"',}\]]+/gi,
  /cookie["\s:=]+[^\s"',}\]]+/gi,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
  /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // jwt-like
  /gho_[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
];

function redact(text) {
  let out = String(text);
  for (const re of REDACT_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

function loadVaultPath() {
  if (process.env.OBSIDIAN_VAULT && fs.existsSync(process.env.OBSIDIAN_VAULT)) {
    return process.env.OBSIDIAN_VAULT;
  }
  const kb = "C:\\Users\\Pedot\\knowledge-bridge\\config.json";
  if (fs.existsSync(kb)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(kb, "utf8"));
      const p = cfg?.obsidian?.vaultPath;
      if (p && fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return DEFAULT_VAULT;
}

/** Source docs relative to repo root → dest note name (no .md) */
const EXPORT_MAP = [
  { src: "CONTEXT.md", dest: "CONTEXT.md", title: "Context & loop status" },
  { src: "README.md", dest: "README.md", title: "Project README" },
  { src: "PROJECT_CHARTER.md", dest: "PROJECT_CHARTER.md", title: "Project charter" },
  { src: "PMP_PLAN.md", dest: "PMP_PLAN.md", title: "PMP plan" },
  { src: "REQUIREMENTS.md", dest: "REQUIREMENTS.md", title: "Requirements" },
  { src: "CHANGELOG.md", dest: "CHANGELOG.md", title: "Changelog" },
  { src: "SECURITY.md", dest: "SECURITY.md", title: "Security" },
  { src: "THREAT_MODEL.md", dest: "THREAT_MODEL.md", title: "Threat model" },
  { src: "RISK_REGISTER.md", dest: "RISK_REGISTER.md", title: "Risk register" },
  { src: "TEST_PLAN.md", dest: "TEST_PLAN.md", title: "Test plan" },
  { src: "RELEASE_PLAN.md", dest: "RELEASE_PLAN.md", title: "Release plan" },
  { src: "INSTALLATION.md", dest: "INSTALLATION.md", title: "Installation" },
  { src: "LLM_PAIRING.md", dest: "LLM_PAIRING.md", title: "LLM pairing" },
  { src: "TROUBLESHOOTING.md", dest: "TROUBLESHOOTING.md", title: "Troubleshooting" },
  { src: "docs/ARCHITECTURE.md", dest: "ARCHITECTURE.md", title: "Architecture" },
  { src: "docs/DASHBOARD_SPEC.md", dest: "DASHBOARD_SPEC.md", title: "Dashboard spec" },
  { src: "docs/MCP_TOOLS.md", dest: "MCP_TOOLS.md", title: "MCP tools" },
  { src: "docs/USER_GUIDE.md", dest: "USER_GUIDE.md", title: "User guide" },
  { src: "docs/OBSIDIAN.md", dest: "OBSIDIAN.md", title: "Obsidian integration" },
  { src: "docs/CLOUD_SYNC.md", dest: "CLOUD_SYNC.md", title: "Cloud improvement sync" },
  { src: "docs/PORTABILITY.md", dest: "PORTABILITY.md", title: "Portability" },
  { src: "docs/adr/0001-electron-control-center.md", dest: "ADR-0001-electron.md", title: "ADR 0001 Electron" },
  { src: "docs/adr/0002-native-messaging.md", dest: "ADR-0002-native-messaging.md", title: "ADR 0002 Native Messaging" },
];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function wikiLink(destFile) {
  return destFile.replace(/\.md$/i, "");
}

function frontmatter(title, tags = []) {
  const tagLine = tags.length ? `\ntags: [${tags.map((t) => t).join(", ")}]` : "";
  return `---\ntitle: ${title}\nproject: ${PROJECT_SLUG}\nsource: chrome-mcp-control-center\nexported: ${new Date().toISOString()}${tagLine}\n---\n\n`;
}

function transformMarkdown(body, title) {
  let text = redact(body);
  // Soften absolute Windows user paths in docs (keep structure, drop username when possible)
  text = text.replace(/C:\\\\Users\\\\[^\\s"'`]+/gi, "C:\\\\Users\\\\[USER]");
  text = text.replace(/C:\/Users\/[^/\s"'`]+/gi, "C:/Users/[USER]");
  // Add backlink footer
  text = text.trimEnd() + `\n\n---\n\n← [[INDEX|Chrome MCP Control Center index]]\n`;
  return frontmatter(title, ["chrome-mcp", "project"]) + text;
}

function buildIndex(exported, outDir) {
  const links = exported
    .map((e) => `- [[${wikiLink(e.dest)}|${e.title}]] — \`${e.src}\``)
    .join("\n");

  const body = `# Chrome MCP Control Center

Local Windows product: single-click Control Center + MCP + Chrome extension (computer-use).

## Quick links

${links}

## Living notes

- [[CONTEXT|Current context & O-A-D-I-E-R loop]]
- [[Progress|Progress snapshot]]
- [[Decisions|Architecture decisions]]
- [[CHANGELOG|Changelog]]

## Repo (local)

\`C:/Users/[USER]/chrome-mcp-control-center\`

## GitHub

https://github.com/firyomaefx/chrome-mcp-control-center

## Export

Run from project:

\`\`\`powershell
npm run obsidian:export
\`\`\`

Auto-runs after \`npm run build\` (postbuild) and \`npm run desktop:pack\`.

**Privacy:** Secrets, tokens, pairing credentials, and private logs are never exported.
`;

  fs.writeFileSync(path.join(outDir, "INDEX.md"), frontmatter("Chrome MCP Control Center", ["chrome-mcp", "index"]) + body, "utf8");
}

function buildProgress(outDir) {
  let context = "";
  let changelog = "";
  try {
    context = fs.readFileSync(path.join(ROOT, "CONTEXT.md"), "utf8");
  } catch {
    context = "(CONTEXT.md missing)";
  }
  try {
    changelog = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
  } catch {
    changelog = "";
  }
  // First ~80 lines of changelog
  const clLines = changelog.split(/\r?\n/).slice(0, 80).join("\n");
  const body = `# Progress snapshot

_Generated ${new Date().toISOString()}_

## From CONTEXT

${redact(context)}

## Recent changelog (excerpt)

${redact(clLines)}

---

← [[INDEX|Index]] · [[CONTEXT|Full context]] · [[CHANGELOG|Full changelog]]
`;
  fs.writeFileSync(
    path.join(outDir, "Progress.md"),
    frontmatter("Progress snapshot", ["chrome-mcp", "progress"]) + body,
    "utf8",
  );
}

function buildDecisions(outDir) {
  const adrs = [
    ["docs/adr/0001-electron-control-center.md", "ADR-0001-electron"],
    ["docs/adr/0002-native-messaging.md", "ADR-0002-native-messaging"],
  ];
  let parts = [`# Architecture decisions\n\n`];
  for (const [src, link] of adrs) {
    const p = path.join(ROOT, src);
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, "utf8");
    parts.push(`## [[${link}]]\n\n${redact(raw)}\n`);
  }
  parts.push(`\n---\n\n← [[INDEX|Index]] · [[ARCHITECTURE|Architecture]]\n`);
  fs.writeFileSync(
    path.join(outDir, "Decisions.md"),
    frontmatter("Architecture decisions", ["chrome-mcp", "adr"]) + parts.join("\n"),
    "utf8",
  );
}

function main() {
  const vault = loadVaultPath();
  if (!fs.existsSync(vault)) {
    const required = process.env.CHROME_MCP_OBSIDIAN_REQUIRED === "1";
    console.warn(
      `[obsidian-export] Vault not found (${vault}). Skipping export so builds work on any PC.`,
    );
    console.warn(
      `[obsidian-export] Set OBSIDIAN_VAULT or CHROME_MCP_OBSIDIAN_PROJECT to enable. Required-fail only if CHROME_MCP_OBSIDIAN_REQUIRED=1.`,
    );
    process.exit(required ? 1 : 0);
  }
  const outDir =
    process.env.CHROME_MCP_OBSIDIAN_PROJECT ||
    path.join(vault, "10-Projects", PROJECT_SLUG);
  ensureDir(outDir);
  ensureDir(path.join(outDir, "meta"));

  const exported = [];
  for (const item of EXPORT_MAP) {
    const srcPath = path.join(ROOT, item.src);
    if (!fs.existsSync(srcPath)) {
      console.warn(`skip missing: ${item.src}`);
      continue;
    }
    const raw = fs.readFileSync(srcPath, "utf8");
    const out = transformMarkdown(raw, item.title);
    fs.writeFileSync(path.join(outDir, item.dest), out, "utf8");
    exported.push(item);
    console.log(`exported ${item.src} → ${item.dest}`);
  }

  buildIndex(exported, outDir);
  buildProgress(outDir);
  buildDecisions(outDir);

  const log = {
    time: new Date().toISOString(),
    vault,
    outDir,
    count: exported.length,
    files: exported.map((e) => e.dest),
  };
  fs.writeFileSync(path.join(outDir, "meta", "export-log.json"), JSON.stringify(log, null, 2), "utf8");
  fs.writeFileSync(
    path.join(outDir, "meta", "export-log.md"),
    frontmatter("Export log", ["chrome-mcp", "meta"]) +
      `# Last export\n\n- **When:** ${log.time}\n- **Vault:** \`${vault}\`\n- **Folder:** \`10-Projects/${PROJECT_SLUG}\`\n- **Files:** ${log.count}\n\n` +
      log.files.map((f) => `- [[${wikiLink(f)}]]`).join("\n") +
      `\n\n← [[INDEX|Index]]\n`,
    "utf8",
  );

  console.log(`\nObsidian export complete: ${outDir} (${exported.length} docs + index/progress/decisions)`);
}

main();
