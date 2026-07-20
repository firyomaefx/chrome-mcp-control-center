# Release Plan

## Channels

- `stable` — MVP after acceptance  
- `beta` — signed or unsigned internal  

## Artifacts

- `ChromeMCPControlCenter-Setup.exe` (NSIS via electron-builder)  
- Extension folder (or CRX later)  
- SHA256 checksums  

## Checklist

- [ ] All Critical defects closed  
- [ ] Unit tests pass  
- [ ] Vertical slice evidence  
- [ ] SECURITY review notes  
- [ ] USER_GUIDE + INSTALLATION + TROUBLESHOOTING  
- [ ] CHANGELOG updated  
- [ ] Tag `v1.0.0`  

## Rollback

Reinstall previous tag; user data preserved under `%APPDATA%\Chrome MCP Control Center`.
