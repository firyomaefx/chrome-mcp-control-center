/**
 * Optional authenticated loopback HTTP transport for dashboard and local clients.
 * Binds 127.0.0.1 only.
 */

import http from "node:http";
import { createRuntime } from "./server.js";
import { authenticateToken, defaultDataDir, loadConfig } from "../config.js";
import { Supervisor } from "../supervisor/supervisor.js";
import { pairLlm, revokeConnection } from "../pairing/llm.js";
import { makeError } from "../errors.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface HttpServerHandle {
  port: number;
  close: () => Promise<void>;
}

export async function startHttpServer(
  dataDir = defaultDataDir(),
  opts: { mockBridge?: boolean; projectRoot?: string } = {},
): Promise<HttpServerHandle> {
  const cfg0 = loadConfig(dataDir);
  const port = cfg0.httpPort;
  const runtime = createRuntime(dataDir, { mockBridge: opts.mockBridge });
  const supervisor = new Supervisor({ dataDir, mockBridge: opts.mockBridge });
  const projectRoot =
    opts.projectRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

  const server = http.createServer(async (req, res) => {
    // Loopback is enforced by listen host; still reject Host tricks lightly
    res.setHeader("Content-Type", "application/json");
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

    try {
      if (url.pathname === "/health") {
        const h = await supervisor.health();
        res.statusCode = 200;
        res.end(JSON.stringify(h));
        return;
      }

      if (url.pathname === "/state") {
        res.end(JSON.stringify(supervisor.getState()));
        return;
      }

      if (url.pathname === "/config" && req.method === "GET") {
        const c = loadConfig(dataDir);
        // never return token hashes in bulk? hashes are ok; no plaintext tokens
        res.end(JSON.stringify(c));
        return;
      }

      // Control endpoints for dashboard (local only)
      if (url.pathname === "/control/start" && req.method === "POST") {
        const snap = await supervisor.startAll();
        res.end(JSON.stringify(snap));
        return;
      }
      if (url.pathname === "/control/stop" && req.method === "POST") {
        res.end(JSON.stringify(await supervisor.stopAll()));
        return;
      }
      if (url.pathname === "/control/emergency" && req.method === "POST") {
        res.end(JSON.stringify(supervisor.emergencyStop()));
        return;
      }
      if (url.pathname === "/control/clear-emergency" && req.method === "POST") {
        res.end(JSON.stringify(supervisor.clearEmergencyStop()));
        return;
      }
      if (url.pathname === "/control/pause" && req.method === "POST") {
        res.end(JSON.stringify(supervisor.pause()));
        return;
      }
      if (url.pathname === "/control/resume" && req.method === "POST") {
        res.end(JSON.stringify(supervisor.resume()));
        return;
      }
      if (url.pathname === "/control/repair" && req.method === "POST") {
        res.end(JSON.stringify(await supervisor.repair()));
        return;
      }
      if (url.pathname === "/control/pair" && req.method === "POST") {
        const body = await readBody(req);
        const name = String(body.name || "default");
        const provider = (body.provider || "generic") as "grok" | "claude" | "codex" | "generic" | "local";
        const { config, bundle } = pairLlm(loadConfig(dataDir), dataDir, projectRoot, name, provider);
        res.end(JSON.stringify({ connection: bundle.connection, token: bundle.token, configs: bundle.configs, files: bundle.files, configSaved: true, connections: config.connections.length }));
        return;
      }
      if (url.pathname === "/control/revoke" && req.method === "POST") {
        const body = await readBody(req);
        const next = revokeConnection(loadConfig(dataDir), dataDir, String(body.id));
        res.end(JSON.stringify({ ok: true, connections: next.connections }));
        return;
      }
      if (url.pathname === "/control/config" && req.method === "POST") {
        const body = await readBody(req);
        const cur = loadConfig(dataDir);
        const next = {
          ...cur,
          ...(typeof body.extensionId === "string" ? { extensionId: body.extensionId } : {}),
          ...(typeof body.permissionMode === "string"
            ? { permissionMode: body.permissionMode as typeof cur.permissionMode, safetyMode: body.permissionMode as typeof cur.safetyMode }
            : {}),
          ...(typeof body.alwaysAllowLowRisk === "boolean" ? { alwaysAllowLowRisk: body.alwaysAllowLowRisk } : {}),
          ...(typeof body.computerUseEnabled === "boolean" ? { computerUseEnabled: body.computerUseEnabled } : {}),
          ...(typeof body.wizardCompleted === "boolean" ? { wizardCompleted: body.wizardCompleted } : {}),
        };
        const { saveConfig } = await import("../config.js");
        saveConfig(dataDir, next);
        res.end(JSON.stringify(next));
        return;
      }

      // MCP-like tool call over HTTP (authenticated)
      if (url.pathname === "/mcp/tools" && req.method === "GET") {
        res.end(
          JSON.stringify({
            tools: runtime.tools.map((t) => ({ name: t.name, description: t.description })),
          }),
        );
        return;
      }

      if (url.pathname === "/mcp/call" && req.method === "POST") {
        const auth = req.headers.authorization || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : (req.headers["x-chrome-mcp-token"] as string | undefined);
        const cfg = loadConfig(dataDir);
        if (cfg.connections.some((c) => !c.revoked)) {
          const conn = authenticateToken(cfg, token);
          if (!conn) {
            res.statusCode = 401;
            res.end(JSON.stringify(makeError("LLM_CLIENT_UNAUTHORIZED", "Unauthorized")));
            return;
          }
          runtime.ctx.clientName = conn.name;
        }
        const body = await readBody(req);
        const tool = runtime.byName.get(String(body.name));
        if (!tool) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "unknown tool" }));
          return;
        }
        const args = (body.arguments || {}) as Record<string, unknown>;
        const parsed = tool.inputSchema.safeParse(args);
        if (!parsed.success) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: parsed.error.message }));
          return;
        }
        const result = await tool.run(parsed.data as Record<string, unknown>);
        res.end(JSON.stringify(result));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}
