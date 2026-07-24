/**
 * Optional authenticated loopback HTTP transport for dashboard and local clients.
 * Binds 127.0.0.1 only.
 */

import http from "node:http";
import fs from "node:fs";
import { createRuntime } from "./server.js";
import { authenticateToken, defaultDataDir, loadConfig, saveConfig } from "../config.js";
import { Supervisor } from "../supervisor/supervisor.js";
import { pairLlm, revokeConnection } from "../pairing/llm.js";
import { makeError } from "../errors.js";
import { bridge } from "../browser/bridge.js";
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
  const supervisor = new Supervisor({
    dataDir,
    mockBridge: opts.mockBridge,
    execPath: process.env.CHROME_MCP_NODE || process.execPath,
    runtimeScript: process.env.CHROME_MCP_RUNTIME_SCRIPT,
    extensionSource: process.env.CHROME_MCP_EXTENSION_SRC,
  });
  const projectRoot =
    opts.projectRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

  const server = http.createServer(async (req, res) => {
    // Loopback is enforced by listen host; still reject Host tricks lightly
    res.setHeader("Content-Type", "application/json");
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

    try {
      if (url.pathname === "/health") {
        const h = await supervisor.health();
        const deep = await supervisor.deepHealth();
        const machine = supervisor.machineStatus();
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            ...h,
            deep,
            machine: {
              foreign: machine.foreign,
              reasons: machine.reasons,
              lastHealOk: machine.lastHeal?.ok,
              lastHealAt: machine.lastHeal ? new Date().toISOString() : undefined,
            },
            versions: {
              ...(h.versions || {}),
              app: deep.versions.app,
            },
          }),
        );
        return;
      }
      if (url.pathname === "/health/deep" && req.method === "GET") {
        res.end(JSON.stringify(await supervisor.deepHealth()));
        return;
      }
      if (url.pathname === "/control/prepare-pc" && req.method === "POST") {
        const body = await readBody(req).catch(() => ({}));
        const soft = Boolean((body as { soft?: boolean }).soft);
        const report = await supervisor.preparePc({ soft });
        res.end(JSON.stringify(report));
        return;
      }
      if (url.pathname === "/control/machine" && req.method === "GET") {
        res.end(JSON.stringify(supervisor.machineStatus()));
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
      if (url.pathname === "/control/connect-chrome" && req.method === "POST") {
        const report = await supervisor.connectChrome();
        res.end(JSON.stringify(report));
        return;
      }

      // Cloud improvement sync (consent + status + flush + delete)
      if (url.pathname === "/cloud/status" && req.method === "GET") {
        const { getTelemetry } = await import("../cloud/telemetry.js");
        res.end(JSON.stringify(getTelemetry(dataDir).status()));
        return;
      }
      if (url.pathname === "/cloud/consent" && req.method === "GET") {
        const { getTelemetry } = await import("../cloud/telemetry.js");
        const { CONSENT_VERSION, FREE_CLOUD_RETENTION_DAYS, PAID_CLOUD_RETENTION_DAYS } =
          await import("../cloud/types.js");
        res.end(
          JSON.stringify({
            consent: getTelemetry(dataDir).getStore().getConsent(),
            requiredVersion: CONSENT_VERSION,
            agreement: {
              title: "Data processing agreement — Chrome MCP improvement sync",
              collected: [
                "Task prompts and normalized objectives",
                "MCP tool calls and browser action types",
                "Failed actions, console/network/automation errors",
                "Recovery attempts and results",
                "Task duration and result",
                "Chrome / MCP / OS versions",
                "Website domain (not full credential URLs)",
                "Crash and restart records",
                "Anonymous usage metrics",
              ],
              paidExtra: [
                "Complete task and AI response history",
                "Workflow versions and encrypted backups",
                "Multi-device settings and restore points",
                "Screenshots/files only when explicitly enabled",
              ],
              reasons: [
                "Detect recurring errors and broken selectors",
                "Improve browser automation and recovery",
                "Compare model performance (e.g. Codex vs Claude)",
                "Monitor Chrome compatibility",
                "Prioritize product fixes and MCP releases",
              ],
              neverCollected: [
                "Passwords",
                "Cookies and session tokens",
                "API keys",
                "OTP / authentication codes",
                "Credit cards and bank information",
                "Private encryption keys",
              ],
              retentionDays: { free: FREE_CLOUD_RETENTION_DAYS, paid: PAID_CLOUD_RETENTION_DAYS },
              deletion: "Settings → Delete my cloud data, or DELETE /cloud/delete-account",
              ownerContact: process.env.CHROME_MCP_OWNER_CONTACT || "owner@chromemcp.local",
              freeNotLocalOnly:
                "Free edition includes mandatory operational cloud sync so the product can improve. Local history remains on your device.",
            },
          }),
        );
        return;
      }
      if (url.pathname === "/cloud/consent" && req.method === "POST") {
        const body = await readBody(req);
        if (!body.accept) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "accept must be true to use the application" }));
          return;
        }
        const { getTelemetry } = await import("../cloud/telemetry.js");
        const plan = body.plan === "paid" ? "paid" : "free";
        getTelemetry(dataDir).acceptConsent(plan, typeof body.contactEmail === "string" ? body.contactEmail : undefined);
        getTelemetry(dataDir).trackUsage("consent_accepted", 1, { plan });
        res.end(JSON.stringify({ ok: true, status: getTelemetry(dataDir).status() }));
        return;
      }
      if (url.pathname === "/cloud/flush" && req.method === "POST") {
        const { getTelemetry } = await import("../cloud/telemetry.js");
        const result = await getTelemetry(dataDir).getSync().flush();
        res.end(JSON.stringify({ ok: true, result, status: getTelemetry(dataDir).status() }));
        return;
      }
      if (url.pathname === "/cloud/delete-account" && req.method === "POST") {
        const { getTelemetry } = await import("../cloud/telemetry.js");
        const result = await getTelemetry(dataDir).getSync().deleteCloudAccount();
        res.end(JSON.stringify(result));
        return;
      }
      if (url.pathname === "/cloud/track-prompt" && req.method === "POST") {
        const body = await readBody(req);
        const { getTelemetry } = await import("../cloud/telemetry.js");
        getTelemetry(dataDir).trackTaskPrompt(String(body.prompt || ""), {
          source: body.source || "api",
          aiModel: body.aiModel,
        });
        res.end(JSON.stringify({ ok: true }));
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

      // ── Extension HTTP relay (loopback only) ──────────────────────────
      if (url.pathname === "/extension/register" && req.method === "POST") {
        const body = await readBody(req);
        const extId = typeof body.extensionId === "string" ? body.extensionId : undefined;
        bridge.touchExtension(extId);
        if (extId) {
          const cur = loadConfig(dataDir);
          if (cur.extensionId !== extId) {
            saveConfig(dataDir, { ...cur, extensionId: extId });
          }
        }
        res.end(
          JSON.stringify({
            ok: true,
            bridge: bridge.status(),
            message: "Extension registered with Control Center",
          }),
        );
        return;
      }

      if (url.pathname === "/extension/heartbeat" && req.method === "POST") {
        const body = await readBody(req);
        bridge.touchExtension(typeof body.extensionId === "string" ? body.extensionId : undefined);
        res.end(JSON.stringify({ ok: true, bridge: bridge.status() }));
        return;
      }

      if (url.pathname === "/extension/poll" && req.method === "GET") {
        const waitMs = Math.min(Number(url.searchParams.get("waitMs") || 15000), 25000);
        bridge.touchExtension();
        const cmd = await bridge.takeCommand(waitMs);
        res.end(JSON.stringify({ ok: true, command: cmd }));
        return;
      }

      if (url.pathname === "/extension/result" && req.method === "POST") {
        const body = await readBody(req);
        const id = String(body.id || "");
        if (!id) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "id required" }));
          return;
        }
        bridge.resolveCommand({
          id,
          ok: Boolean(body.ok),
          data: body.data,
          error: typeof body.error === "string" ? body.error : undefined,
        });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname === "/extension/status" && req.method === "GET") {
        res.end(JSON.stringify(bridge.status()));
        return;
      }

      // CRX force-install assets (Chrome 137+ / 150 — --load-extension removed)
      if (url.pathname === "/extension/update.xml" && req.method === "GET") {
        const p = path.join(dataDir, "crx", "update.xml");
        if (!fs.existsSync(p)) {
          res.statusCode = 404;
          res.end("missing update.xml — run Connect Chrome first");
          return;
        }
        res.setHeader("Content-Type", "application/xml");
        res.end(fs.readFileSync(p));
        return;
      }
      if (
        (url.pathname === "/extension/chrome-mcp.crx" || url.pathname === "/extension/extension.crx") &&
        req.method === "GET"
      ) {
        const p = path.join(dataDir, "crx", "chrome-mcp.crx");
        if (!fs.existsSync(p)) {
          res.statusCode = 404;
          res.end("missing crx");
          return;
        }
        res.setHeader("Content-Type", "application/x-chrome-extension");
        res.end(fs.readFileSync(p));
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
