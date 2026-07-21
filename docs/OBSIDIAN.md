# Obsidian integration

## Destination

| Item | Path |
|------|------|
| Vault | `OneDrive/Obsidian/TTRG` |
| Project folder | `10-Projects/chrome-mcp-control-center/` |
| Entry note | `INDEX.md` |

## What is exported

- Architecture, charter, requirements, PMP, security, threat model, risks  
- CONTEXT, changelog, installation, pairing (template only), troubleshooting  
- ADRs → Decisions hub + individual ADR notes  
- Generated: `Progress.md`, `meta/export-log.md`

## What is never exported

- Passwords, API keys, tokens, bearer credentials  
- `CHROME_MCP_TOKEN` values  
- Private keys / PEM contents  
- Pairing `TOKEN.txt` or live config secrets  
- Runtime logs under user data  
- Audit JSONL with raw tool payloads  

Redaction runs via the same class of patterns as the MCP redactor.

## When it updates

| Trigger | Command |
|---------|---------|
| Manual | `npm run obsidian:export` |
| After TypeScript build | `postbuild` → export |
| After installer pack | `desktop:pack` ends with export |

## Override paths

```powershell
$env:OBSIDIAN_VAULT = "D:\MyVault"
$env:CHROME_MCP_OBSIDIAN_PROJECT = "D:\MyVault\10-Projects\chrome-mcp-control-center"
npm run obsidian:export
```

Default vault path is read from `knowledge-bridge/config.json` when present.
