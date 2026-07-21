# CONTEXT.md — Chrome MCP Control Center

**Updated:** 2026-07-21  
**Current loop:** Loop 3 — Connect CAPA (extension single-click)  
**GitHub:** https://github.com/firyomaefx/chrome-mcp-control-center

## CAPA summary (this loop)

| Item | Detail |
|------|--------|
| Problem | Dashboard stuck on Extension not connected; Connect Chrome useless |
| Root cause | No auto load of extension; Start All did not wait/register; NM hard-gated Ready |
| Corrective | `connectChrome()` stages + relaunches Chrome with `--load-extension`, waits for HTTP register |
| Preventive | connect-chrome tests; health HTTP-primary; UI wired to `/control/connect-chrome` |

## Test evidence

- `npm test` → **30/30 pass**
- `demo-slice` → pass

## User decision

Auto-relaunch Chrome when extension not connected (no confirm dialog).

## Cloud improvement sync (Free + Paid)

- Free is **not** local-only: mandatory operational sync after DPA consent.
- Local-first: `local-history/` + `sync-queue/`; HTTPS upload; redaction.
- Owner backend: `npm run cloud:backend` → dashboard `http://127.0.0.1:8788/`
- Docs: `docs/CLOUD_SYNC.md`

## Obsidian

Vault: `C:\Users\Pedot\OneDrive\Obsidian\TTRG`  
Project notes: `10-Projects/chrome-mcp-control-center/`  

```powershell
npm run obsidian:export
```

Also runs on `postbuild` and after `desktop:pack`. Never exports tokens, pairing secrets, or private logs.
