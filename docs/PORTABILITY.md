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

## Moved to another PC?

The app **detects a different machine** (hostname / machine id / missing old paths) and auto-repairs:

1. Open Control Center  
2. If you see **“New or different PC detected”** → click **Prepare this PC**  
   (or just **Start All** — it runs the same heal playbook)  
3. Accept data agreement if prompted  
4. Chrome may relaunch once to load the extension  

### What auto-heal fixes

| Issue | Action |
|-------|--------|
| Paths from old PC in launch-config | Rewrite for this install |
| Stale native host registry | Re-register |
| Extension not staged | Copy extension into this data dir |
| Port 18787 busy | Pick a free port |
| Extension not connected | Connect Chrome / force-install |
| Force-install policy stale | Re-pack CRX + re-apply policy |

### What you still do manually

- Install Chrome if missing  
- Accept the data agreement  
- Re-pair LLM if the old absolute path was saved in a client config  

Heal log appears under Home after Prepare / Repair.
