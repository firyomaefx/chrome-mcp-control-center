# Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Status not Ready | Component failed health | Run Health Check → Repair System |
| Extension disconnected | Chrome running without extension | Click **Connect Chrome** or **Start All** (auto-relaunch once) |
| Extension still fails after relaunch | Control Center HTTP not up / enterprise blocks --load-extension | Confirm services running; Repair System; check Diagnostics steps |
| CHROME_NOT_FOUND | Chrome missing | Install Google Chrome |
| NATIVE_HOST_NOT_REGISTERED | Registry missing | Repair System |
| PERMISSION_DENIED | Domain or level | Permissions page |
| EMERGENCY_STOP_ACTIVE | You stopped | Resume after explicit confirmation |
| MCP tools missing | Client not paired | Pair LLM |
| Port conflict | Another process on loopback port | Repair picks free port |

Logs: Control Center → Diagnostics → Open diagnostics folder.
