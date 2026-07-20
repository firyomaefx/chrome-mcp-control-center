# Project Charter — Chrome MCP Control Center

## Business need

Non-technical Windows users cannot safely connect LLM agents to their real Chrome session without JSON, ports, Native Messaging, and CLI. That blocks computer-use productivity and creates security mistakes.

## Product goal

Ship a production-ready local Chrome MCP system: one signed installer path, one desktop shortcut, one Control Center, one-click Start/Stop, LLM pairing, health/repair, DOM-first automation with computer-use fallback and hard permission gates.

## Target users

- Primary: Non-technical Windows users using Grok / Claude / Codex / local LLMs
- Secondary: Power users and developers integrating MCP clients

## Scope (MVP)

See CONTEXT.md current scope. Vertical slice §20 is the gate for expansion.

## Out of scope (MVP)

- Public cloud MCP relay
- Multi-machine fleet control
- Level-3 high-risk automation (purchases, trading, account deletion)
- Automatic execution of downloaded files
- Telemetry without consent

## Stakeholders

| Role | Interest |
|------|----------|
| End user | Simple, safe browser automation |
| Security owner | Least privilege, audit, no secret leak |
| LLM providers / clients | Standard MCP tool surface |
| Maintainer | Maintainable architecture + tests |

## Success metrics

- Start All success ≥ 98% in reliability runs
- Controlled page tool success ≥ 95%
- Zero silent high-risk actions
- Zero password/token exposure in logs or tool results
- Unauthorized clients rejected
- Documentation complete for install / pair / recover

## Major risks

1. Chrome extension policy / ID registration friction  
2. Unsigned installer trust warnings  
3. Prompt injection via webpage content  
4. Computer-use false clicks (mitigate: DOM first, L2 confirmation)

## MVP definition

All criteria in REQUIREMENTS.md § MVP Acceptance (spec §18) met with evidence; vertical slice §20 passes tests.

## Authority

This charter authorizes execution of the PMP plan and O-A-D-I-E-R loops until MVP gates pass or an external blocker is reached.
