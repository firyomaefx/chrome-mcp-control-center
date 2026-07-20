# MCP Tools

## Result envelope

Every tool returns JSON including:

```json
{
  "ok": true,
  "tabId": 1,
  "target": null,
  "method": "dom",
  "durationMs": 12,
  "pageChanges": [],
  "error": null,
  "recovery": null,
  "screenshotRef": null,
  "data": {}
}
```

## Observation (MVP implemented)

- `browser_get_status`
- `browser_list_windows`
- `browser_list_tabs`
- `browser_get_active_tab`
- `browser_focus_tab`
- `browser_read_page`
- `browser_read_accessibility_tree`
- `browser_find_elements`
- `browser_get_element_details`
- `browser_capture_screenshot`
- `browser_extract_links`
- `browser_extract_table`
- `browser_read_console`
- `browser_read_network_errors`
- `browser_get_downloads`

## Action (MVP implemented)

- `browser_open_url`, `browser_create_tab`, `browser_close_tab`
- `browser_reload`, `browser_go_back`, `browser_go_forward`
- `browser_click`, `browser_type`, `browser_clear_field`
- `browser_select_option`, `browser_check`, `browser_uncheck`
- `browser_scroll`, `browser_hover`, `browser_drag_drop`
- `browser_upload_file`, `browser_download_file`
- `browser_wait_for`, `browser_handle_dialog`
- `browser_execute_workflow`

## Computer-use (guarded)

- `computer_list_windows`, `computer_focus_window`, `computer_capture_screen`
- `computer_locate_text`, `computer_click`, `computer_type`
- `computer_press_key`, `computer_scroll`, `computer_wait`
- `computer_request_user_takeover`

Computer-use requires permission mode allowing Level ≥ 2 computer scope and is not available during Emergency Stop.

## System

- `system_health`, `system_emergency_status`
