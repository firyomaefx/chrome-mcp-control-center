# Dashboard Specification

## Principles

- One primary window: **Chrome MCP Control Center**
- Large action buttons; no terminal required
- Status uses **color + icon + text**
- Never show Ready if any required component fails

## Status model

| State | Color | Meaning |
|-------|-------|---------|
| Ready | Green | All required components healthy |
| Needs attention | Yellow | Partial / recoverable |
| Stopped / Failed | Red | Down or error |
| Not configured | Grey | Setup incomplete |

## Home

Shows overall status, MCP, Chrome, Extension, LLM, current tab, workflow, permission mode, last error; Start / Pause / Stop / Emergency.

## Pages

Home · LLM Connections · Chrome · Workflows · Autofill · Permissions · Logs · Diagnostics · Settings

## First-run wizard

Steps 1–6 per product spec §6. Persist `wizardCompleted` in user config; re-show if config invalid.
