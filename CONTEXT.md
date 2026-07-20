# CONTEXT.md — Chrome MCP Control Center

**Updated:** 2026-07-21  
**Current loop:** Loop 2 complete  
**PMP phase:** Execution (M1 + M2 packaging smoke)  
**GitHub:** https://github.com/firyomaefx/chrome-mcp-control-center

## Product goal

Single-click Windows product so a non-technical user can install one app, open one desktop shortcut, click Start All, and let an MCP-compatible LLM safely control Chrome (DOM-first) with computer-use fallback and hard permission gates.

## Implementation status

| Component | Status |
|-----------|--------|
| PMP docs | Done |
| Permissions / audit / errors | Done |
| Supervisor Start/Stop/Emergency | Done + tested |
| MCP tools (browser + autofill + computer + system) | Done |
| **HTTP extension bridge (real control plane)** | **Done + tested** |
| MV3 extension (HTTP poll + optional NM) | Done |
| Electron dashboard + wizard | Done |
| LLM pairing | Done |
| Health / Repair | Done |
| Unit + bridge + vertical-slice tests | **25/25 pass** |
| demo-slice CLI | **pass** |
| Portable Windows exe | **Built** `desktop/release/ChromeMCPControlCenter-1.0.0-portable.exe` |
| win-unpacked desktop shortcut path | **Built** |
| NSIS one-click Setup | Attempted; portable is primary ship path this loop |
| Code signing | Deferred (no cert; symlink privilege on winCodeSign) |
| Manual Chrome Load-unpacked E2E | Probe only — requires user UI click |

## Test evidence (Loop 2)

```
npm run build     → pass
npm test          → 25 pass, 0 fail
  - permissions, redact, supervisor, vertical-slice
  - autofill, computer-use
  - extension HTTP bridge (register → list_tabs → read → screenshot → click confirm → emergency)
node dist/cli.js demo-slice → pass
scripts/live-chrome-probe.mjs → Chrome found + extension path OK
portable build → ChromeMCPControlCenter-1.0.0-portable.exe (~71 MB)
```

## Architecture change (Loop 2)

**Before:** In-process mock / disconnected native host process.  
**After:** Control Center HTTP server owns the bridge queue. Extension registers and long-polls `127.0.0.1` for commands and posts results. This is the production control plane.

## Known limitations

1. Unsigned portable/NSIS — SmartScreen may warn  
2. First Chrome connection still needs Load unpacked (or future Web Store ID)  
3. Real mouse injection opt-in only (`CHROME_MCP_ALLOW_INPUT=1`)  
4. OCR locate stub  
5. Full manual Chrome session E2E not automated (Chrome security blocks silent extension install)

## Next actions (Loop 3 candidates)

1. Custom app icon + signed build when cert available  
2. One-click extension sideload helper UX polish  
3. Workflow recorder UI  
4. Publish GitHub Release with portable.exe + checksums  

## Loop history

| Loop | Focus | Outcome |
|------|-------|---------|
| 0 | Scaffold | Partial |
| 1 | Vertical slice + GitHub | Complete |
| 2 | Live extension HTTP bridge + pack | **Complete** |
