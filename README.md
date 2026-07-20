# Chrome MCP Control Center

**Single-click Windows Chrome Computer-Use MCP** for non-technical users.

Install one app → open one desktop shortcut → complete a short wizard → click **Start All** → pair your LLM → automate Chrome safely.

## Features (MVP)

- **Control Center** desktop app (Start All / Stop All / Emergency Stop)
- **Local MCP server** (stdio + optional loopback HTTP)
- **Chrome extension** (Manifest V3) + **Native Messaging**
- **DOM-first** browser tools; **computer-use** fallback (guarded)
- **Permission engine** (read-only → reversible → commitment; L3 blocked)
- **LLM pairing** for Grok CLI, Claude, Codex, generic MCP clients
- **Health check**, **Repair**, audit logs with redaction

## Quick start (developers)

```powershell
npm install
npm run build
npm test
npm run desktop
```

End-user install: see [INSTALLATION.md](INSTALLATION.md).  
Pairing: [LLM_PAIRING.md](LLM_PAIRING.md).  
Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).  
Living status: [CONTEXT.md](CONTEXT.md).

## Vertical slice

1. Open Control Center → Start All  
2. Extension connects via Native Messaging  
3. Pair Grok CLI  
4. `browser_list_tabs` → `browser_read_page` → approve → `browser_click`  
5. Emergency Stop blocks next action  
6. Stop All clean shutdown  

## Security

See [SECURITY.md](SECURITY.md) and [THREAT_MODEL.md](THREAT_MODEL.md).  
Webpage content is untrusted. Passwords and payment data never return to the LLM.

## License

MIT
