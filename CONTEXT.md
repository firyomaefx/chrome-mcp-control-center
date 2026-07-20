# CONTEXT.md — Chrome MCP Control Center

**Updated:** 2026-07-21  
**Current loop:** Loop 1 complete → Loop 2 ready  
**PMP phase:** Execution (M1 vertical slice passed)  
**GitHub:** https://github.com/firyomaefx/chrome-mcp-control-center

## Product goal

Single-click Windows product so a non-technical user can install one app, open one desktop shortcut, click Start All, and let an MCP-compatible LLM safely control Chrome (DOM-first) with computer-use fallback and hard permission gates.

## Current scope (MVP)

Vertical slice §20 implemented and automated with mock bridge. Live Chrome E2E and signed installer are next.

## Architecture (summary)

Control Center (Electron) → Supervisor + loopback HTTP → MCP tools → PermissionEngine → Browser bridge → Extension (Native Messaging) → Chrome. Computer-use is guarded fallback.

## Decisions

| ID | Decision |
|----|----------|
| D1 | TypeScript + MCP SDK |
| D2 | Electron Control Center |
| D3 | Native Messaging for real session |
| D4 | stdio MCP default; HTTP loopback optional |
| D5 | Permission levels 0–3; L3 blocked |
| D6 | Mock bridge for CI vertical slice |

## Implementation status

| Component | Status |
|-----------|--------|
| PMP docs | Done |
| Permissions / audit / errors | Done |
| Supervisor Start/Stop/Emergency | Done + tested |
| MCP tools (browser + computer + system) | Done |
| Native host + MV3 extension | Done (live Chrome needs unpacked load) |
| Electron dashboard + wizard | Done |
| LLM pairing | Done |
| Health / Repair | Done |
| Unit + vertical-slice tests | **13/13 pass** |
| demo-slice CLI | **pass** |
| NSIS packaging config | Present (`desktop/`); not built in CI this loop |
| Code signing | Deferred (no cert) |

## Known defects / limitations

1. **Unsigned installer** — Windows SmartScreen may warn (R2).  
2. **Unpacked extension ID** — user must load unpacked and save ID, then Repair.  
3. **Computer-use real input** — simulated unless `CHROME_MCP_ALLOW_INPUT=1`.  
4. **OCR locate** — stub; DOM-first path preferred.  
5. **Live Chrome E2E** — not automated in CI (mock bridge used).  
6. **Autofill UI** — engine minimal; full profile CRUD deferred polish.

## Security risks

| Risk | Status |
|------|--------|
| False Ready | Mitigated by health gate |
| Prompt injection | Heuristic + untrusted content policy |
| Unauthorized client | Token auth when paired |
| Secret leakage | Redaction + no password return |
| Unsigned update | Open |

## Test evidence (Loop 1)

```
npm run build  → pass
npm test       → 13 pass, 0 fail
node dist/cli.js demo-slice → pass
  startOverall ready, list/read/find/click ok, emergencyBlocked true
```

## Loop history

| Loop | Focus | Outcome |
|------|-------|---------|
| 0 | Scaffold | package + partial docs |
| 1 | PMP + vertical slice + GitHub | **Complete** — tests green, repo pushed |

## Next actions (Loop 2)

1. Real Chrome E2E with loaded extension  
2. `npm run desktop:pack` smoke build  
3. Authenticode signing pipeline when cert available  
4. Deepen autofill + workflow recorder  
5. Harden computer-use with explicit confirm UX  

## Assumptions

- Windows 10/11, Chrome installed for production use  
- Node 20+ for development  
