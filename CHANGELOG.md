# Changelog

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
