# Chrome MCP Control Center — User Guide

**You do not need PowerShell, JSON editing, or developer tools for normal use.**

## First time (about 5 minutes)

1. Install using the setup program (`ChromeMCPControlCenter-Setup.exe`).
2. Open **Chrome MCP Control Center** from the desktop shortcut.
3. Follow the first-run wizard:
   - Confirm install location is OK.
   - Click **Connect Chrome** (installs / enables the extension).
   - Pick your AI app (Grok, Claude, Codex, or Other).
   - Click **Pair** (copies the right connection settings automatically).
4. Click **Start All**.
5. When the status shows **Ready**, you can run browser workflows from your AI app.

## Every day

1. Open the desktop shortcut.
2. Click **Start All** (or leave services running if already started).
3. Use your AI app as usual.

## Buttons explained

| Button | What it does |
|--------|----------------|
| **Start All** | Checks install, starts services, connects Chrome, runs a quick health check |
| **Stop All** | Stops automation services cleanly; leaves Chrome open |
| **Connect Chrome** | Opens extension folder / reconnect help |
| **Pair LLM** | Sets up Grok / Claude / Codex / generic MCP |
| **Pause Automation** | Freezes AI control; you keep the browser |
| **Emergency Stop** | Immediate halt of all automation |
| **Run Health Check** | Shows what is working / broken in plain language |
| **Repair System** | Fixes common problems (host registration, ports) |

## Safety

- The AI only acts within your permission mode and domain rules.
- You can pause or emergency-stop at any time.
- Your Chrome logins stay in your normal Chrome profile.
- Nothing is exposed to the public internet by default.
- Ready is never shown if a required component failed.

## If something looks wrong

1. Click **Run Health Check**.
2. Click **Repair System**.
3. Restart Chrome, then click **Start All** again.
4. Open the diagnostics folder from Logs / Diagnostics and share the latest log with support.
