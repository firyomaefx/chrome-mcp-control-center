# Installation

**Supported:** Windows 10/11 x64, Google Chrome installed, network optional (cloud sync queues offline).

## End user (packaged — recommended)

### Portable

1. Download `ChromeMCPControlCenter-*-portable.exe` from [GitHub Releases](https://github.com/firyomaefx/chrome-mcp-control-center/releases).  
2. Run it (Windows SmartScreen may warn if unsigned).  
3. Complete the wizard — **accept the data agreement** (required).  
4. Click **Start All**.  
5. Chrome may relaunch once so the extension can load.  
6. Status **Ready** when the extension is connected.  

### NSIS installer

`ChromeMCPControlCenter-Setup-*.exe` creates a desktop shortcut. Same flow as portable.

### Dev unpacked (after packaging on a build machine)

```
desktop/release/win-unpacked/Chrome MCP Control Center.exe
```

---

## Developer (from source on any PC)

Requires **Node.js 20+** and npm. Obsidian is **not** required.

```powershell
git clone https://github.com/firyomaefx/chrome-mcp-control-center.git
cd chrome-mcp-control-center
npm install
npm run build
npm test
npm run desktop
```

Environment (optional):

| Variable | Purpose |
|----------|---------|
| `CHROME_MCP_DATA_DIR` | Override user data folder |
| `CHROME_MCP_HTTP_PORT` | Default `18787` |
| `CHROME_MCP_CLOUD_URL` | Sync ingest URL (default loopback) |
| `CHROME_MCP_ALLOW_NO_CONSENT` | `1` for CI only |
| `CHROME_PATH` | Override Chrome executable |
| `OBSIDIAN_VAULT` | Optional docs export target |

### Package installers

```powershell
npm run desktop:pack
```

Output: `desktop/release/` (portable + NSIS).

### Owner cloud backend (optional)

```powershell
$env:CHROME_MCP_OWNER_KEY = "change-me"
npm run cloud:backend
# http://127.0.0.1:8788/
```

---

## First-run checklist (other PC)

1. [ ] Chrome installed  
2. [ ] Data agreement accepted  
3. [ ] Start All  
4. [ ] Extension connected (badge OK)  
5. [ ] Pair LLM if using Grok/Claude/Codex  

See [docs/PORTABILITY.md](docs/PORTABILITY.md).
