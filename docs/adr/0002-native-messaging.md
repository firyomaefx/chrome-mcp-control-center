# ADR 0002: Native Messaging for Chrome session access

## Status

Accepted

## Context

We must use the user's existing logged-in Chrome session without launching a separate automation browser.

## Decision

MV3 extension + Chrome Native Messaging host registered under HKCU.

## Consequences

+ Real session / cookies  
− Extension ID registration friction for unpacked installs  
