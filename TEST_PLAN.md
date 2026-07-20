# Test Plan

## Unit

- Permission levels and domain policies  
- Error codes and recovery fields  
- Secret redaction  
- Workflow state machine (basic)  
- Supervisor emergency stop  
- Tool schema validation  
- Native message size/schema  

## Integration

- MCP list_tools / call_tool with mock browser bridge  
- Pairing config generation  
- Health + repair dry-run  
- Audit write/read  

## Dashboard (manual / scripted)

- Start All / Stop All / Emergency Stop  
- No false Ready  
- Wizard completion flag  

## E2E (controlled pages)

- `tests/fixtures/demo.html` — title, button click with approval  

## Security

- Unauthorized token  
- Disallowed domain  
- Oversized NM message  
- Redaction samples  

## Evidence

Record in CONTEXT.md and test output under `artifacts/`.
