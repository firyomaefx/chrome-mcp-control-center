import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { buildTools, type ToolContext } from "./tools.js";
import { loadConfig, authenticateToken, defaultDataDir, ensureDataDirs } from "../config.js";
import { PermissionEngine } from "../permissions/engine.js";
import { BrowserEngine } from "../browser/engine.js";
import { ComputerUseEngine } from "../computer/engine.js";
import { AuditLog } from "../audit.js";
import { bridge } from "../browser/bridge.js";
import { makeError } from "../errors.js";
import { failResult } from "../result.js";

const SERVER_INFO = { name: "chrome-mcp-control-center", version: "1.0.0" } as const;

export function createRuntime(dataDir = defaultDataDir(), opts: { mockBridge?: boolean } = {}) {
  ensureDataDirs(dataDir);
  let cfg = loadConfig(dataDir);
  if (opts.mockBridge || process.env.CHROME_MCP_MOCK === "1") {
    bridge.enableMock();
  }
  const permissions = new PermissionEngine(() => loadConfig(dataDir));
  const browser = new BrowserEngine(dataDir);
  if (opts.mockBridge || process.env.CHROME_MCP_MOCK === "1") browser.enableMock();
  const computer = new ComputerUseEngine(cfg.computerUseEnabled, dataDir);
  const audit = new AuditLog(dataDir);

  const ctx: ToolContext = {
    dataDir,
    permissions,
    browser,
    computer,
    audit,
    getConfig: () => loadConfig(dataDir),
    mockBridge: opts.mockBridge || process.env.CHROME_MCP_MOCK === "1",
  };

  const tools = buildTools(ctx);
  const byName = new Map(tools.map((t) => [t.name, t]));

  return { dataDir, tools, byName, ctx, getConfig: () => loadConfig(dataDir), refreshConfig: () => { cfg = loadConfig(dataDir); } };
}

export function createMcpServer(dataDir?: string, opts?: { mockBridge?: boolean }): Server {
  const runtime = createRuntime(dataDir, opts);
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: runtime.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema, { target: "openApi3" }) as Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const token = process.env.CHROME_MCP_TOKEN;
    const cfg = runtime.getConfig();
    // If connections exist, require valid token
    if (cfg.connections.some((c) => !c.revoked)) {
      const conn = authenticateToken(cfg, token);
      if (!conn) {
        const err = failResult(makeError("LLM_CLIENT_UNAUTHORIZED", "Invalid or missing CHROME_MCP_TOKEN"));
        return { content: [{ type: "text", text: JSON.stringify(err) }], isError: true };
      }
      runtime.ctx.clientName = conn.name;
    }

    const name = request.params.name;
    const tool = runtime.byName.get(name);
    if (!tool) {
      return {
        content: [{ type: "text", text: JSON.stringify(failResult(makeError("INVALID_ARGUMENT", `Unknown tool: ${name}`))) }],
        isError: true,
      };
    }
    const parsed = tool.inputSchema.safeParse(request.params.arguments ?? {});
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              failResult(makeError("INVALID_ARGUMENT", parsed.error.message)),
            ),
          },
        ],
        isError: true,
      };
    }
    const result = await tool.run(parsed.data as Record<string, unknown>);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      isError: !result.ok,
    };
  });

  return server;
}

export async function serveStdio(dataDir?: string): Promise<void> {
  const server = createMcpServer(dataDir);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
