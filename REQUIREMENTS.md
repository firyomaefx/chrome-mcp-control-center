# Requirements — Chrome MCP Control Center

## Functional requirements (selected)

| ID | Requirement | Priority | Component | MVP |
|----|-------------|----------|-----------|-----|
| FR-01 | One installer deploys components | Critical | Installer | Y |
| FR-02 | One desktop shortcut opens Control Center | Critical | Desktop | Y |
| FR-03 | Start All launches + verifies components | Critical | Supervisor | Y |
| FR-04 | Stop All safe shutdown, Chrome stays open | Critical | Supervisor | Y |
| FR-05 | Emergency Stop blocks new actions | Critical | Supervisor | Y |
| FR-06 | Dashboard component health (color+text) | Critical | Desktop | Y |
| FR-07 | Extension via Native Messaging | Critical | Ext/Host | Y |
| FR-08 | Grok CLI pair + list tools | Critical | Pairing/MCP | Y |
| FR-09 | List existing Chrome tabs | Critical | Browser | Y |
| FR-10 | Read page text/forms | Critical | Browser | Y |
| FR-11 | Click/type/select/scroll | Critical | Browser | Y |
| FR-12 | Screenshot | High | Browser | Y |
| FR-13 | Autofill preview only (no silent submit) | High | Autofill | Y-min |
| FR-14 | Submission requires approval | Critical | Permissions | Y |
| FR-15 | Computer-use fallback scenario | Medium | Computer | Y-min |
| FR-16 | Unauthorized client rejected | Critical | Pairing | Y |
| FR-17 | Disallowed domain blocked | Critical | Permissions | Y |
| FR-18 | Log redaction | Critical | Audit | Y |
| FR-19 | Repair registration/connection | High | Diagnostics | Y |
| FR-20 | First-run wizard | High | Desktop | Y |

## Non-functional

| ID | Requirement |
|----|-------------|
| NFR-01 | No false Ready |
| NFR-02 | Loopback only by default |
| NFR-03 | Structured errors with recovery |
| NFR-04 | End user needs no CLI |

## MVP acceptance (spec §18)

See ARCHITECTURE.md and TEST_PLAN.md. Gate: vertical slice §20 must pass before expanding autofill/computer-use depth.

## Traceability matrix (high level)

| Spec section | Artifacts |
|--------------|-----------|
| §3 Components | src/*, extension/, desktop/ |
| §4–6 Dashboard/Wizard | desktop/renderer/* |
| §10–11 Tools | src/mcp/tools/* |
| §14–16 Security/Errors | src/permissions, src/errors |
| §17 Tests | tests/* |
| §19 Deliverables | docs root markdown files |
