# LLM Pairing

The Control Center generates configs. You should not hand-edit JSON unless you want to.

## Grok CLI

Pairing writes an MCP server entry pointing at the packaged `chrome-mcp` stdio binary (or `node dist/cli.js serve` in dev).

Example (generated — paths are absolute on **your** machine):

```json
{
  "mcpServers": {
    "chrome-mcp": {
      "command": "node",
      "args": ["<path-to-repo>/dist/cli.js", "serve"],
      "env": {
        "CHROME_MCP_TOKEN": "<generated>",
        "CHROME_MCP_DATA_DIR": "%APPDATA%/Chrome MCP Control Center/data"
      }
    }
  }
}
```

Replace `<path-to-repo>` with your clone path, or use the **Pair LLM** button so the app fills it in.

## Claude Desktop / Claude Code

Same stdio pattern under `mcpServers`.

## Codex

Uses the generic MCP stdio adapter; paste the generated block.

## Generic

Any MCP client supporting stdio can use the `serve` command.

## Revoke / rotate

Dashboard → LLM Connections → Revoke or Rotate credentials. Old tokens stop working immediately.
