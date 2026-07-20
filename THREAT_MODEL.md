# Threat Model

| Threat | Impact | Likelihood | Control |
|--------|--------|------------|---------|
| Webpage prompt injection | Agent follows malicious page text | High | Untrusted content labeling; no free-form execute |
| Tool-result poisoning | Model trusts forged DOM | Medium | Schema validation; source tags |
| Rogue extension | Session theft | Medium | Extension ID allowlist on native host |
| Unauthorized MCP client | Arbitrary browser control | High | Pairing tokens; revoke |
| Exposed local server | LAN abuse | Medium | 127.0.0.1 only |
| Secret leakage | Credential loss | High | Redaction; never return passwords |
| Path traversal | File system abuse | Medium | Path allowlist |
| Malicious downloads | Code exec | Medium | No auto-exec |
| Update tampering | Supply chain | Medium | Signature verify (when cert present) |
| Duplicate submit | Double booking | Medium | Workflow submit tokens |
| Session theft via NM | Privilege abuse | Low | Host validation + least privilege |

## Residual risks

- Unsigned installer (user must trust download channel)
- Computer-use coordinate clicks (higher confirmation)
