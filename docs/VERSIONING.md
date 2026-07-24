# Versioning & release naming

One number, same everywhere. Easy to tell builds apart on any PC.

## Semantic version

```
MAJOR.MINOR.PATCH[-prerelease]
```

| Part | When to bump | Example |
|------|----------------|---------|
| **MAJOR** | Breaking install/UX or incompatible data | `1.0.3` → `2.0.0` |
| **MINOR** | New features, backward compatible | `1.0.3` → `1.1.0` |
| **PATCH** | Fixes, portability, heal improvements | `1.0.3` → `1.0.4` |
| **prerelease** | Test builds only | `1.1.0-beta.1`, `1.1.0-rc.1` |

**Source of truth:** root `package.json` → `version` (also mirrored in `VERSION` file).

Sync all copies:

```powershell
npm run version:sync
```

## What must match

| Location | Field |
|----------|--------|
| `package.json` | `version` |
| `VERSION` | plain text |
| `desktop/package.json` | `version` |
| `extension/manifest.json` | `version` |
| `src/version.ts` | generated / kept in sync |
| GitHub release tag | `v{version}` e.g. `v1.0.4` |
| Installer files | see artifacts below |
| Health / cloud telemetry | `appVersion` / `mcpVersion` |

## GitHub release tags

| Kind | Tag format | Title format |
|------|------------|--------------|
| Stable | `v1.0.4` | `v1.0.4 — short summary` |
| Beta | `v1.1.0-beta.1` | `v1.1.0-beta.1 — short summary` |
| RC | `v1.1.0-rc.1` | `v1.1.0-rc.1 — short summary` |

Do **not** use free-form tags like `v1.0.0-loop2` for new releases (hard to sort and compare).

## Installer / artifact filenames

Pattern (Windows x64):

```
ChromeMCP-ControlCenter_{version}_win-x64_{kind}.exe
```

| Kind | Meaning | Example |
|------|---------|---------|
| `Setup` | NSIS one-click installer + desktop shortcut | `ChromeMCP-ControlCenter_1.0.4_win-x64_Setup.exe` |
| `Portable` | No install, run anywhere | `ChromeMCP-ControlCenter_1.0.4_win-x64_Portable.exe` |

Optional future editions (only if separate builds exist):

```
ChromeMCP-ControlCenter_{version}_win-x64_{kind}_{edition}.exe
```

`edition` = `Free` | `Paid` (plan is also in app settings / telemetry).

## Display name (UI)

- Product: **Chrome MCP Control Center**
- About / health: `Chrome MCP Control Center 1.0.4` (from `getAppVersion()`)
- Window title stays product name; version shown on Home / Diagnostics

## Channels (config, not filename)

| Channel | Use |
|---------|-----|
| `stable` | Default release track |
| `beta` | Optional early builds |

Stored in app `updateChannel`; not required in the filename until auto-update is live.

## Free vs Paid

- **Same app binary** for now; plan is `free` | `paid` in config/identity.
- Separate Free/Paid installers only when you intentionally ship two builds; then add `_{edition}` to the artifact name.

## Release checklist

1. Bump version: edit `package.json` `version` (or `npm version patch|minor|major --no-git-tag-version`)  
2. `npm run version:sync`  
3. Update `CHANGELOG.md` under `## {version}`  
4. `npm test` / `npm run smoke:portability`  
5. `npm run desktop:pack`  
6. Tag + release: `v{version}` with both Setup + Portable artifacts  

## Historical note

Older artifacts used mixed names (`ChromeMCPControlCenter-Setup-1.0.x.exe`, tag `v1.0.0-loop2`).  
From the next release onward, use the patterns in this document only.
