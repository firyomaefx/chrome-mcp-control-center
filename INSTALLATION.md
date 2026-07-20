# Installation

## End user (packaged)

### Portable (recommended until code signing is available)

1. Download `ChromeMCPControlCenter-*-portable.exe` from GitHub Releases.  
2. Run it (Windows may warn if unsigned — verify the download channel).  
3. Click **Start All** (or **Connect Chrome**).  
4. Chrome may **relaunch once** so the extension can load into your real profile (logins stay; tabs usually restore).  
5. Status becomes **Ready** when the extension registers — no manual Load unpacked for the normal path.  

### NSIS installer

`ChromeMCPControlCenter-Setup-*.exe` creates a desktop shortcut. Same Start All flow.

### Dev unpacked

```
desktop/release/win-unpacked/Chrome MCP Control Center.exe
```

## Developer (from source)

```powershell
cd C:\Users\Pedot\chrome-mcp-control-center
npm install
npm run build
npm test
npm run desktop
```

### Load extension (unpacked)

1. Chrome → Extensions → Developer mode  
2. Load unpacked → select `extension/`  
3. Copy extension ID into Control Center → Chrome → Repair Native Messaging  

### Package installer

```powershell
npm run desktop:pack
```

Output under `desktop/release/`.
