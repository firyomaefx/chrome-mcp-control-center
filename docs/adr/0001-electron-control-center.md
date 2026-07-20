# ADR 0001: Electron Control Center

## Status

Accepted

## Context

Non-technical Windows users need one desktop app without CLI setup.

## Decision

Use Electron for the Control Center UI and process supervision, packaging with electron-builder (NSIS).

## Consequences

+ Single shortcut, tray, IPC  
− Larger installer; supply-chain care for Electron versions  
