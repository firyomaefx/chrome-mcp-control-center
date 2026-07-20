# Installation

## End user (packaged)

1. Download `ChromeMCPControlCenter-Setup.exe` from Releases.  
2. Run the installer (Windows may warn if unsigned — verify publisher/channel).  
3. Open **Chrome MCP Control Center** from the desktop.  
4. Complete the first-run wizard.  
5. Click **Start All**.  

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
