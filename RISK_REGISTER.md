# Risk Register

| ID | Risk | Sev | Prob | Mitigation | Owner | Status |
|----|------|-----|------|------------|-------|--------|
| R1 | Chrome extension ID changes when unpacked | H | H | Repair re-register; document load-unpacked | Eng | Open |
| R2 | No Authenticode cert | H | M | Document warning; prepare signing pipeline | Release | Open |
| R3 | False Ready status | C | L | Health gate hard fail | Eng | Mitigated in design |
| R4 | Prompt injection | H | H | Untrusted page content policy | Sec | Mitigated |
| R5 | Electron supply chain | M | L | Pin versions; lockfile | Eng | Open |
| R6 | Computer-use misclick | H | M | DOM-first; L2 confirm; L3 block | Eng | Mitigated |
