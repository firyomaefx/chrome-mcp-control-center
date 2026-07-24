# Portability — run on another Windows PC

## Guarantees

| Scenario | Requirement |
|----------|-------------|
| Packaged portable/Setup | No Node install; Chrome + consent |
| `git clone` + build | Node **20+**, npm; **no Obsidian** required |
| Native Messaging | Registered via Repair using absolute Electron/Node paths |
| Cloud sync | Optional; offline queues locally |

## Smoke checks (maintainers)

```powershell
npm run smoke:portability
npm run build          # must not require Obsidian
$env:CHROME_MCP_ALLOW_NO_CONSENT=1; npm test
```

## Common failures on a new PC

| Symptom | Cause | Fix |
|---------|--------|-----|
| `npm run build` fails on Obsidian | Old versions exited 1 | Use ≥1.0.3; export soft-skips |
| Runtime missing | Forgot `bundle:runtime` | `npm run desktop` runs build+bundle |
| Extension not connected | Chrome 150+ / not loaded | Start All / Connect Chrome (force-install) |
| Consent error on tools | DPA not accepted | Cloud & Privacy → Accept |
| Sync pending forever | No cloud backend | Expected offline; or start `cloud:backend` |

## Hardcoded paths policy

Runtime code must not embed `C:\Users\<name>\...`.  
Samples use `%APPDATA%` / `<path-to-repo>` placeholders.
