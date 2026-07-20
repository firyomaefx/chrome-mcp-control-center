# Architecture — Chrome MCP Control Center

See also root [CONTEXT.md](../CONTEXT.md).

## Overview

```
User → Control Center (Electron)
         ├─ Supervisor (Start/Stop/Emergency)
         ├─ HTTP loopback API (127.0.0.1)
         └─ UI pages + wizard

LLM → MCP stdio (cli.js serve)
         → PermissionEngine → BrowserEngine → Bridge → Extension → Chrome
                              └→ ComputerUseEngine (fallback)
```

## Lifecycle

1. **Start All:** integrity → repair NM if needed → mark MCP running → health → Ready only if pass  
2. **Stop All:** stop accepting work; keep Chrome; keep logs  
3. **Emergency Stop:** set flags; reject tools; require explicit clear  

## Tool result contract

See [MCP_TOOLS.md](MCP_TOOLS.md).

## Security boundaries

- Untrusted page content  
- Authenticated clients when paired  
- Loopback-only HTTP  
- Redacted audit logs  
