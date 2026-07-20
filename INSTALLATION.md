# Installation

## End user (packaged)

### Portable (recommended until code signing is available)

1. Download `ChromeMCPControlCenter-1.0.0-portable.exe` from the repo `desktop/release/` or GitHub Releases.  
2. Run it (Windows may warn if unsigned — verify the download channel).  
3. Complete the first-run wizard.  
4. **Connect Chrome:** Extensions → Developer mode → Load unpacked → select the bundled `extension` folder (or repo `extension/`).  
5. Click **Start All** — status becomes **Ready** when the extension is connected.  

### NSIS installer

When present: `ChromeMCPControlCenter-Setup-*.exe` creates a desktop shortcut automatically.

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
