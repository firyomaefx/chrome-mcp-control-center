#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultDataDir, ensureDataDirs, loadConfig, saveConfig } from "./config.js";
import { serveStdio } from "./mcp/server.js";
import { startHttpServer } from "./mcp/http.js";
import { Supervisor } from "./supervisor/supervisor.js";
import { runHealthCheck, writeDiagnosticReport } from "./diagnostics/health.js";
import { repairSystem } from "./diagnostics/repair.js";
import { pairLlm } from "./pairing/llm.js";
import { createRuntime } from "./mcp/server.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const dataDir = defaultDataDir();
  ensureDataDirs(dataDir);

  switch (cmd) {
    case "serve":
    case undefined:
      // default: stdio MCP
      await serveStdio(dataDir);
      break;
    case "serve-http": {
      const mock = rest.includes("--mock") || process.env.CHROME_MCP_MOCK === "1";
      const handle = await startHttpServer(dataDir, { mockBridge: mock, projectRoot });
      console.error(`chrome-mcp HTTP listening on http://127.0.0.1:${handle.port}`);
      // keep alive
      await new Promise(() => {});
      break;
    }
    case "health": {
      const mock = rest.includes("--mock");
      const report = await runHealthCheck(dataDir, { mockBridge: mock });
      const out = writeDiagnosticReport(dataDir, report);
      console.log(JSON.stringify(report, null, 2));
      console.error(`Wrote ${out}`);
      process.exit(report.ok ? 0 : 1);
      break;
    }
    case "repair": {
      const report = await repairSystem(dataDir);
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.ok ? 0 : 1);
      break;
    }
    case "start": {
      const sup = new Supervisor({ dataDir, mockBridge: rest.includes("--mock") });
      const snap = await sup.startAll();
      console.log(JSON.stringify(snap, null, 2));
      break;
    }
    case "stop": {
      const sup = new Supervisor({ dataDir });
      console.log(JSON.stringify(await sup.stopAll(), null, 2));
      break;
    }
    case "emergency": {
      const sup = new Supervisor({ dataDir });
      console.log(JSON.stringify(sup.emergencyStop(), null, 2));
      break;
    }
    case "pair": {
      const provider = (rest[0] || "grok") as "grok" | "claude" | "codex" | "generic" | "local";
      const name = rest[1] || provider;
      const { bundle } = pairLlm(loadConfig(dataDir), dataDir, projectRoot, name, provider);
      console.log(JSON.stringify({ token: bundle.token, files: bundle.files, sample: bundle.configs.grok }, null, 2));
      break;
    }
    case "tools": {
      const rt = createRuntime(dataDir, { mockBridge: true });
      console.log(rt.tools.map((t) => t.name).join("\n"));
      break;
    }
    case "demo-slice": {
      // Vertical slice automated with mock bridge
      process.env.CHROME_MCP_MOCK = "1";
      const sup = new Supervisor({ dataDir, mockBridge: true });
      // ensure not emergency
      const cfg = loadConfig(dataDir);
      cfg.emergencyStop = false;
      cfg.paused = false;
      cfg.permissionMode = "allow_low_risk";
      cfg.alwaysAllowLowRisk = true;
      saveConfig(dataDir, cfg);

      const start = await sup.startAll();
      const rt = createRuntime(dataDir, { mockBridge: true });
      const list = await rt.byName.get("browser_list_tabs")!.run({});
      const read = await rt.byName.get("browser_read_page")!.run({ tabId: 1 });
      const find = await rt.byName.get("browser_find_elements")!.run({ text: "Test Button" });
      const clickDenied = await rt.byName.get("browser_click")!.run({
        selector: "#demo-btn",
        // no confirmed — with allow_low_risk + alwaysAllowLowRisk should pass for L1
      });
      const click = await rt.byName.get("browser_click")!.run({
        selector: "#demo-btn",
        confirmed: true,
      });
      sup.emergencyStop();
      const blocked = await rt.byName.get("browser_click")!.run({
        selector: "#demo-btn",
        confirmed: true,
      });
      // clear for future tests
      sup.clearEmergencyStop();
      await sup.stopAll();

      const report = {
        startOverall: start.overall,
        listOk: list.ok,
        readOk: read.ok,
        findOk: find.ok,
        clickOk: click.ok || clickDenied.ok,
        emergencyBlocked: !blocked.ok && blocked.error?.code === "EMERGENCY_STOP_ACTIVE",
        stop: "ok",
      };
      console.log(JSON.stringify(report, null, 2));
      const pass =
        report.listOk && report.readOk && report.findOk && report.clickOk && report.emergencyBlocked;
      process.exit(pass ? 0 : 1);
      break;
    }
    default:
      console.error(`Unknown command: ${cmd}
Usage:
  chrome-mcp serve | serve-http | health | repair | start | stop | emergency | pair | tools | demo-slice
`);
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
