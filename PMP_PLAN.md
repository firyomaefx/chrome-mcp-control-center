# PMP Plan — Chrome MCP Control Center

## Work Breakdown Structure (WBS)

1. **Foundation** — repo, build, CONTEXT, docs  
2. **Control Center** — Electron shell, pages, wizard  
3. **Supervisor** — lifecycle, single instance, health  
4. **MCP Server** — stdio/HTTP, tool registry  
5. **Extension + Native Host** — NM protocol  
6. **Browser Engine** — observation + actions  
7. **Permissions + Audit** — levels, redaction  
8. **Pairing** — Grok/Claude/Codex configs  
9. **Diagnostics/Repair**  
10. **Installer + Updates**  
11. **Test + Release**

## Milestone plan

| M | Name | Exit criteria |
|---|------|---------------|
| M0 | Initiation | Charter + CONTEXT + gap analysis |
| M1 | Vertical slice | §20 flow unit/integration green |
| M2 | Dashboard complete | Pages + wizard functional |
| M3 | Security gates | Auth, redaction, domain block tests |
| M4 | Package | NSIS build succeeds |
| M5 | Close | Acceptance checklist + release notes |

## Execution order (per spec §9)

1. Repository and build foundation  
2. Windows Control Center shell  
3. Process supervisor  
4. Local MCP server  
5. Chrome extension  
6. Native Messaging bridge  
7. Browser observation tools  
8. Browser action tools  
9. Permission engine  
10. Autofill engine (minimal MVP)  
11. Workflow engine (minimal MVP)  
12. Computer-use fallback (guarded stubs + one path)  
13. LLM pairing  
14. Diagnostics and repair  
15. Audit logs  
16. Installer and updates  
17. Documentation  

## Risk register

See RISK_REGISTER.md.

## Definition of Done (feature)

- Typed interface  
- Structured errors  
- Unit tests where logic is non-trivial  
- Audit events for permissioned actions  
- Docs updated if user-visible  
- No Critical security open  

## Rollback

- Git tags before packaging (`v1.0.0-mvp-slice`)  
- User data never deleted by Stop All / Repair  
- Repair is additive (re-register host) not destructive  

## Requirements traceability

See REQUIREMENTS.md matrix.
