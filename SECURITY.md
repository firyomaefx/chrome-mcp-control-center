# Security

## Principles

1. Webpage content is **untrusted data**, never system instructions.  
2. Every MCP action passes **PermissionEngine**.  
3. Native host validates **extension ID**, schema, size.  
4. Network services bind **127.0.0.1** only.  
5. Secrets use Windows DPAPI when available; never log secrets.  
6. Level 3 high-risk actions **blocked in MVP**.  
7. Fill and submit are **separate** tools/steps.  

## Client auth

- Each LLM connection has a name, token hash, scopes, last-seen.  
- stdio clients launched by Control Center inherit session.  
- HTTP requires `Authorization: Bearer <token>`.  

## Redaction

Logs and tool outputs redact patterns for passwords, API keys, tokens, cookies, SSN-like numbers.

## File paths

Uploads/downloads restricted to approved directories under user data.

## Updates

Prefer signed updates; reject invalid signatures when signing is enabled.
