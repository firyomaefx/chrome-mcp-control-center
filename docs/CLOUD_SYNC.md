# Cloud improvement sync

Both **Free** and **Paid** editions synchronize operational data to the owner cloud backend. Free is **not** local-only.

## Why

- Detect recurring errors and broken selectors  
- Improve automation and recovery  
- Compare AI models (Codex vs Claude)  
- Monitor Chrome / MCP / OS compatibility  
- Prioritize fixes and releases  

## Free vs Paid

| Capability | Free | Paid |
|------------|------|------|
| Local SQLite/history, screenshots, workflows, rollback | Yes | Yes |
| Mandatory operational cloud sync | Yes | Yes |
| Owner error & usage analytics | Yes | Yes |
| Complete task / AI response history in cloud | No | Yes |
| Workflow cloud backups / multi-device / restore | No | Yes |
| Screenshots/files in cloud | No | Opt-in |
| Cloud retention | 30 days | 365 days |

## Never synced

Passwords, cookies, session tokens, API keys, OTPs, credit cards, bank data, private keys.  
Sensitive fields become:

```json
{ "field_type": "password", "value": "[REDACTED]", "character_count": 14 }
```

## Flow

1. Save locally (`local-history/`)  
2. Enqueue (`sync-queue/`)  
3. Upload when online (HTTPS; HTTP only for loopback)  
4. Retry failures; dedupe by `clientEventId`  
5. Record last successful sync  
6. User can delete cloud data  

## Consent

Required before MCP tools run (`Cloud & Privacy` or wizard step 1).  
Agreement version: `2026-07-21-v1`.

## Client config

```powershell
$env:CHROME_MCP_CLOUD_URL = "http://127.0.0.1:8788/v1/ingest"
$env:CHROME_MCP_PLAN = "free"   # or paid
```

## Owner backend

```powershell
$env:CHROME_MCP_OWNER_KEY = "your-secret"
node cloud-backend/server.mjs
# Dashboard: http://127.0.0.1:8788/
```

### Owner metrics

- Active Free/Paid users  
- Success / failure rates  
- Top errors, failed actions, broken selectors  
- Recovery rates  
- Chrome / domain / MCP version failures  
- Codex vs Claude aggregates  
- Crash frequency  

Filters: date, app version, Chrome, OS, domain, AI model, error category, plan.

## APIs (Control Center)

| Endpoint | Purpose |
|----------|---------|
| `GET /cloud/consent` | Agreement text + status |
| `POST /cloud/consent` | `{ accept: true, plan }` |
| `GET /cloud/status` | Sync queue + last success |
| `POST /cloud/flush` | Upload now |
| `POST /cloud/delete-account` | Wipe cloud + local sync store |
