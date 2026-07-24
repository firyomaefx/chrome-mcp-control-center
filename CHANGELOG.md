# Changelog

## 1.0.3 — 2026-07-21 (Portability + cloud sync)

### Portability (other PCs)

- Obsidian export no longer fails `npm run build` when vault is missing
- Native host launcher uses absolute Electron/Node paths + `host` CLI entry
- Electron writes `launch-config.json` for portable NM host
- Generic install/pairing samples (no machine-specific paths)
- `npm run smoke:portability` + pretest gate
- Desktop version aligned to 1.0.3

### Cloud improvement sync

### Added

- Mandatory Free + Paid operational cloud sync (local-first queue, retry, dedupe)
- Consent / DPA gate before MCP tools (wizard + Cloud & Privacy page)
- Sensitive field redaction (`[REDACTED]` + character_count)
- Owner cloud backend (`cloud-backend/server.mjs`) + improvement dashboard
- Owner metrics: errors, broken selectors, recovery, Chrome/domain/MCP, Codex vs Claude
- Free retains local history; Paid scopes add AI responses / workflow cloud kinds

## 1.0.2 — 2026-07-21 (Chrome 150 connect)

### Root cause (your health dump)

Chrome **150.x removed `--load-extension`** on branded Chrome. v1.0.1 relaunched Chrome with that flag → extension never loaded → `connected: false` forever while Chrome/native host looked fine.

### Fix

- Pack local **CRX** (Chrome `--pack-extension`, still works)
- **HKCU force-install policy** (`ExtensionInstallForcelist` + install sources)
- `file://` update.xml/crx so install does not depend on HTTP being up
- Serve CRX/update.xml on loopback for updates
- Relaunch Chrome so policy applies

## 1.0.1 — 2026-07-21 (Connect CAPA)

### Fixed (critical)

- **Root cause:** Connect Chrome only opened a folder; extension never auto-loaded → permanent “Extension not connected”.
- **Connect Chrome / Start All** now: stage extension → repair host → **auto-relaunch Chrome with `--load-extension`** on the real profile → wait for HTTP register → Ready.
- Health Ready uses **HTTP bridge** (Native Messaging no longer hard-blocks Ready when extension is connected).
- Extension SW: faster retry, port scan, alarms keep-alive.

### Release

- Portable + NSIS rebuild for v1.0.1

## 1.0.0 — 2026-07-21 (Loop 2)

### Added

- **HTTP extension control plane** (`/extension/register|poll|result|heartbeat`) so the Control Center and Chrome extension share one live command queue on `127.0.0.1`
- Extension service worker uses HTTP primary path (Native Messaging optional)
- Autofill MCP tools: `autofill_detect`, `autofill_preview`, `autofill_fill` (submit stays separate; secrets protected)
- Extension HTTP bridge integration tests (simulated extension client)
- Autofill + computer-use unit tests
- Portable Windows artifact: `desktop/release/ChromeMCPControlCenter-1.0.0-portable.exe`
- Unpacked app: `desktop/release/win-unpacked/`
- Live Chrome probe script: `scripts/live-chrome-probe.mjs`

### Fixed

- Desktop no longer forces `CHROME_MCP_MOCK=1` by default
- Packaging skips code-sign symlink privilege issues (`signAndEditExecutable: false`)

### Evidence

- `npm test` → 25/25 pass
- `node dist/cli.js demo-slice` → pass (includes autofill + takeover)
- Portable installer build → success

## 1.0.0 — 2026-07-21

### Added

- Project foundation, PMP docs, CONTEXT loop tracking
- Local MCP server (stdio + optional authenticated loopback HTTP)
- Permission engine (levels 0–3), audit log with redaction
- Process supervisor: Start All / Stop All / Emergency Stop
- Chrome MV3 extension + Native Messaging host
- Browser observation and action tools (vertical slice)
- Computer-use guarded stubs + request takeover
- Electron Control Center, first-run wizard, dashboard pages
- LLM pairing generators (Grok, Claude, Codex, generic)
- Health check and Repair System
- Unit/integration tests and demo fixture page
- electron-builder packaging configuration
