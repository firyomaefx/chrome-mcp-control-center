#!/usr/bin/env node
/**
 * Owner cloud backend (improvement sync).
 * - POST /v1/ingest  (device Bearer key)
 * - GET  /v1/owner/metrics
 * - GET  /v1/owner/events
 * - DELETE /v1/user/data
 *
 * Row separation: every record stored under userId; devices only access own userId.
 * Owner key: CHROME_MCP_OWNER_KEY (required for metrics).
 *
 * Default bind: 127.0.0.1:8788 (set CHROME_MCP_CLOUD_BIND / PORT for deploy).
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.CHROME_MCP_CLOUD_DATA || path.join(__dirname, "data");
const BIND = process.env.CHROME_MCP_CLOUD_BIND || "127.0.0.1";
const PORT = Number(process.env.PORT || process.env.CHROME_MCP_CLOUD_PORT || 8788);
const OWNER_KEY = process.env.CHROME_MCP_OWNER_KEY || "dev-owner-change-me";

fs.mkdirSync(path.join(DATA, "events"), { recursive: true });
fs.mkdirSync(path.join(DATA, "users"), { recursive: true });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function authBearer(req) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  return "";
}

function hashKey(k) {
  return crypto.createHash("sha256").update(k, "utf8").digest("hex");
}

function userDir(userId) {
  return path.join(DATA, "users", userId.replace(/[^a-zA-Z0-9_-]/g, ""));
}

function registerDevice(userId, deviceKey) {
  const dir = userDir(userId);
  fs.mkdirSync(dir, { recursive: true });
  const devicesPath = path.join(dir, "devices.json");
  let devices = [];
  if (fs.existsSync(devicesPath)) {
    devices = JSON.parse(fs.readFileSync(devicesPath, "utf8"));
  }
  const hk = hashKey(deviceKey);
  if (!devices.find((d) => d.keyHash === hk)) {
    devices.push({ keyHash: hk, firstSeen: new Date().toISOString() });
    fs.writeFileSync(devicesPath, JSON.stringify(devices, null, 2));
  }
}

function deviceAllowed(userId, deviceKey) {
  const devicesPath = path.join(userDir(userId), "devices.json");
  if (!fs.existsSync(devicesPath)) return true; // first contact registers
  const devices = JSON.parse(fs.readFileSync(devicesPath, "utf8"));
  const hk = hashKey(deviceKey);
  return devices.some((d) => d.keyHash === hk);
}

function appendEvents(userId, records) {
  const day = new Date().toISOString().slice(0, 10);
  const f = path.join(DATA, "events", `${day}.jsonl`);
  const seenPath = path.join(userDir(userId), "seen.json");
  let seen = new Set();
  if (fs.existsSync(seenPath)) {
    seen = new Set(JSON.parse(fs.readFileSync(seenPath, "utf8")));
  }
  let accepted = 0;
  let dupes = 0;
  for (const r of records) {
    if (r.userId !== userId) continue; // RLS-style isolation
    const cid = r.clientEventId || r.recordId;
    if (seen.has(cid)) {
      dupes++;
      continue;
    }
    seen.add(cid);
    fs.appendFileSync(
      f,
      JSON.stringify({ ...r, ingestedAt: new Date().toISOString() }) + "\n",
    );
    accepted++;
  }
  fs.mkdirSync(userDir(userId), { recursive: true });
  fs.writeFileSync(seenPath, JSON.stringify([...seen].slice(-100000)));
  return { accepted, dupes };
}

function loadAllEvents(maxDays = 30) {
  const dir = path.join(DATA, "events");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort().reverse();
  const out = [];
  let days = 0;
  for (const f of files) {
    if (days >= maxDays) break;
    days++;
    const lines = fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        out.push(JSON.parse(line));
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

function computeMetrics(events, filters = {}) {
  let list = events;
  if (filters.plan) list = list.filter((e) => e.plan === filters.plan);
  if (filters.domain) list = list.filter((e) => e.websiteDomain === filters.domain);
  if (filters.appVersion) list = list.filter((e) => e.appVersion === filters.appVersion);
  if (filters.chromeVersion) list = list.filter((e) => e.chromeVersion === filters.chromeVersion);
  if (filters.os) list = list.filter((e) => (e.osVersion || "").includes(filters.os));
  if (filters.aiModel) list = list.filter((e) => e.aiModel === filters.aiModel);
  if (filters.errorCategory) list = list.filter((e) => e.errorCategory === filters.errorCategory);
  if (filters.kind) list = list.filter((e) => e.kind === filters.kind);
  if (filters.since) list = list.filter((e) => e.createdAt >= filters.since);
  if (filters.until) list = list.filter((e) => e.createdAt <= filters.until);

  const users = new Set(list.map((e) => e.userId));
  const freeUsers = new Set(list.filter((e) => e.plan === "free").map((e) => e.userId));
  const paidUsers = new Set(list.filter((e) => e.plan === "paid").map((e) => e.userId));

  const taskResults = list.filter((e) => e.kind === "task_result");
  const success = taskResults.filter((e) => e.payload?.ok === true).length;
  const failed = taskResults.filter((e) => e.payload?.ok === false).length;
  const failRate = taskResults.length ? failed / taskResults.length : 0;

  const errorCounts = {};
  for (const e of list.filter((x) =>
    ["failed_action", "automation_error", "console_error", "network_error", "crash_report"].includes(
      x.kind,
    ),
  )) {
    const key =
      e.errorCategory ||
      e.payload?.error?.code ||
      e.payload?.tool ||
      e.payload?.action ||
      e.kind;
    errorCounts[key] = (errorCounts[key] || 0) + 1;
  }
  const topErrors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  const failedActions = {};
  for (const e of list.filter((x) => x.kind === "failed_action")) {
    const a = e.payload?.action || e.payload?.tool || "unknown";
    failedActions[a] = (failedActions[a] || 0) + 1;
  }
  const topFailedActions = Object.entries(failedActions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  const brokenSelectors = {};
  for (const e of list) {
    const sel = e.payload?.selector || e.payload?.args?.selector;
    if (sel && (e.kind === "failed_action" || e.payload?.ok === false)) {
      brokenSelectors[String(sel)] = (brokenSelectors[String(sel)] || 0) + 1;
    }
  }
  const topBrokenSelectors = Object.entries(brokenSelectors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([selector, count]) => ({ selector, count }));

  const recoveries = list.filter((e) => e.kind === "recovery_result");
  const recoveryOk = recoveries.filter((e) => e.payload?.success === true).length;
  const recoverySuccessRate = recoveries.length ? recoveryOk / recoveries.length : 0;
  const avgRecoveryAttempts =
    recoveries.length === 0
      ? 0
      : recoveries.reduce((s, e) => s + Number(e.payload?.attempt || 1), 0) / recoveries.length;

  const chromeFails = {};
  for (const e of list.filter((x) => x.kind === "failed_action" || x.kind === "crash_report")) {
    const v = e.chromeVersion || "unknown";
    chromeFails[v] = (chromeFails[v] || 0) + 1;
  }

  const domainFails = {};
  for (const e of list.filter((x) => x.kind === "failed_action")) {
    const d = e.websiteDomain || "unknown";
    domainFails[d] = (domainFails[d] || 0) + 1;
  }

  const mcpFails = {};
  for (const e of list.filter((x) => x.kind === "failed_action" || x.kind === "automation_error")) {
    const v = e.mcpVersion || e.appVersion || "unknown";
    mcpFails[v] = (mcpFails[v] || 0) + 1;
  }

  // Codex vs Claude
  const modelStats = {};
  for (const e of list) {
    const m = e.aiModel || e.payload?.model || e.payload?.provider;
    if (!m) continue;
    const key = String(m).toLowerCase();
    if (!modelStats[key]) modelStats[key] = { total: 0, success: 0, failed: 0 };
    modelStats[key].total++;
    if (e.kind === "task_result" && e.payload?.ok === true) modelStats[key].success++;
    if (e.kind === "task_result" && e.payload?.ok === false) modelStats[key].failed++;
    if (e.kind === "failed_action") modelStats[key].failed++;
  }

  const crashes = list.filter((e) => e.kind === "crash_report").length;

  return {
    totalActiveUsers: users.size,
    freeUsers: freeUsers.size,
    paidUsers: paidUsers.size,
    successfulTasks: success,
    failedTasks: failed,
    failureRate: failRate,
    mostCommonErrors: topErrors,
    mostCommonFailedActions: topFailedActions,
    brokenSelectors: topBrokenSelectors,
    recoverySuccessRate,
    averageRecoveryAttempts: avgRecoveryAttempts,
    chromeVersionFailures: Object.entries(chromeFails).map(([version, count]) => ({ version, count })),
    websiteDomainFailures: Object.entries(domainFails)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([domain, count]) => ({ domain, count })),
    mcpVersionFailures: Object.entries(mcpFails).map(([version, count]) => ({ version, count })),
    codexVsClaude: modelStats,
    crashFrequency: crashes,
    eventCount: list.length,
    generatedAt: new Date().toISOString(),
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Chrome-MCP-User");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${BIND}:${PORT}`);

  try {
    if (url.pathname === "/health") {
      res.end(JSON.stringify({ ok: true, service: "chrome-mcp-cloud" }));
      return;
    }

    if (url.pathname === "/v1/ingest" && req.method === "POST") {
      const token = authBearer(req);
      const body = await readBody(req);
      const userId = String(body.userId || req.headers["x-chrome-mcp-user"] || "");
      if (!userId || !token) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      if (!deviceAllowed(userId, token)) {
        // first-time: if no devices yet, allow
        const dp = path.join(userDir(userId), "devices.json");
        if (fs.existsSync(dp)) {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: "device_not_allowed" }));
          return;
        }
      }
      registerDevice(userId, token);
      const records = Array.isArray(body.records) ? body.records : [];
      // Enforce user isolation
      for (const r of records) {
        if (r.userId && r.userId !== userId) {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: "user_mismatch" }));
          return;
        }
        r.userId = userId;
      }
      const result = appendEvents(userId, records);
      res.end(JSON.stringify({ ok: true, ...result }));
      return;
    }

    if (url.pathname === "/v1/user/data" && req.method === "DELETE") {
      const token = authBearer(req);
      const userId = String(req.headers["x-chrome-mcp-user"] || "");
      if (!userId || !token || !deviceAllowed(userId, token)) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      const dir = userDir(userId);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      // Note: historical jsonl lines remain anonymized for owner analytics unless full purge requested
      res.end(JSON.stringify({ ok: true, deletedUserDir: true }));
      return;
    }

    if (url.pathname.startsWith("/v1/owner/") ) {
      const token = authBearer(req);
      if (token !== OWNER_KEY) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "owner_unauthorized" }));
        return;
      }
      const events = loadAllEvents(90);
      if (url.pathname === "/v1/owner/metrics") {
        const filters = Object.fromEntries(url.searchParams.entries());
        res.end(JSON.stringify(computeMetrics(events, filters)));
        return;
      }
      if (url.pathname === "/v1/owner/events") {
        const limit = Math.min(Number(url.searchParams.get("limit") || 100), 1000);
        res.end(JSON.stringify({ events: events.slice(0, limit) }));
        return;
      }
      if (url.pathname === "/v1/owner/diagnostics") {
        res.end(
          JSON.stringify({
            recentCrashes: events.filter((e) => e.kind === "crash_report").slice(0, 50),
            recentRestarts: events.filter((e) => e.kind === "app_restart").slice(0, 50),
          }),
        );
        return;
      }
    }

    // Static owner dashboard
    if (url.pathname === "/" || url.pathname === "/dashboard") {
      const dash = path.join(__dirname, "owner-dashboard.html");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(fs.readFileSync(dash, "utf8"));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  }
});

server.listen(PORT, BIND, () => {
  console.error(`chrome-mcp cloud backend http://${BIND}:${PORT}`);
  console.error(`Owner key env CHROME_MCP_OWNER_KEY (default dev-only)`);
});
