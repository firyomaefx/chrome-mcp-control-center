import fs from "node:fs";
import path from "node:path";
import { loadConfig, saveConfig, type AppConfig } from "../config.js";
import { StateStore, type SystemSnapshot } from "./state.js";
import { runHealthCheck, type HealthReport } from "../diagnostics/health.js";
import { repairSystem, type RepairReport } from "../diagnostics/repair.js";
import { AppError } from "../errors.js";

export interface SupervisorOptions {
  dataDir: string;
  /** When true, do not require live extension for overall ready in tests */
  mockBridge?: boolean;
}

/**
 * Process supervisor: Start All / Stop All / Emergency Stop.
 * Does not kill Chrome. Preserves logs and config.
 */
export class Supervisor {
  private running = false;
  private state: StateStore;
  private cfg: AppConfig;
  private listeners = new Set<(s: SystemSnapshot) => void>();

  constructor(private opts: SupervisorOptions) {
    this.cfg = loadConfig(opts.dataDir);
    this.state = new StateStore(opts.dataDir);
  }

  getConfig(): AppConfig {
    this.cfg = loadConfig(this.opts.dataDir);
    return this.cfg;
  }

  saveConfig(cfg: AppConfig): void {
    this.cfg = cfg;
    saveConfig(this.opts.dataDir, cfg);
  }

  getState(): SystemSnapshot {
    return this.state.get();
  }

  onState(fn: (s: SystemSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const s = this.state.get();
    for (const fn of this.listeners) fn(s);
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Start All — integrity, NM, MCP readiness, health. Never false Ready. */
  async startAll(): Promise<SystemSnapshot> {
    this.state.update({
      overall: "stopped",
      mcp: "starting",
      lastError: undefined,
    });
    this.emit();

    try {
      // Integrity
      const integrityOk = this.checkIntegrity();
      if (!integrityOk.ok) {
        this.state.update({
          mcp: "failed",
          lastError: integrityOk.error,
        });
        this.emit();
        throw new AppError("COMPONENT_START_FAILED", integrityOk.error ?? "Integrity check failed");
      }

      // Apply emergency flag from config
      this.cfg = loadConfig(this.opts.dataDir);
      if (this.cfg.emergencyStop) {
        this.state.update({
          emergencyStop: true,
          mcp: "failed",
          lastError: "Emergency Stop is active — clear it before Start All",
        });
        this.emit();
        throw new AppError("EMERGENCY_STOP_ACTIVE", "Clear Emergency Stop before starting");
      }

      // Native host registration check / soft repair
      const repair = await repairSystem(this.opts.dataDir, { onlyIfNeeded: true });
      this.state.update({
        nativeHost: repair.nativeHostRegistered ? "running" : "failed",
      });

      // MCP "process" is in-process for stdio; mark running when server module loads.
      this.running = true;
      this.state.update({
        mcp: "running",
        permissionMode: this.cfg.permissionMode,
        emergencyStop: false,
        paused: this.cfg.paused,
      });

      // Chrome / extension
      const health = await runHealthCheck(this.opts.dataDir, {
        mockBridge: this.opts.mockBridge,
      });
      this.applyHealth(health);

      const snap = this.state.get();
      // Hard gate: Ready only if health says so
      if (snap.overall === "ready" || (this.opts.mockBridge && snap.mcp === "running")) {
        if (this.opts.mockBridge) {
          this.state.update({
            chrome: "running",
            extension: "running",
            nativeHost: "running",
            overall: "ready",
          });
        }
      }
      this.emit();
      return this.state.get();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.running = false;
      this.state.update({ mcp: "failed", lastError: msg });
      this.emit();
      throw e;
    }
  }

  async stopAll(): Promise<SystemSnapshot> {
    // Stop new requests, pause workflows conceptually, keep Chrome open
    this.running = false;
    this.cfg = loadConfig(this.opts.dataDir);
    // Do not clear emergency stop here — user must clear explicitly if set
    this.state.update({
      mcp: "stopped",
      overall: "stopped",
      // leave chrome/extension as-is (Chrome stays open)
      lastError: undefined,
    });
    this.emit();
    return this.state.get();
  }

  emergencyStop(): SystemSnapshot {
    this.cfg = loadConfig(this.opts.dataDir);
    this.cfg.emergencyStop = true;
    this.cfg.paused = true;
    saveConfig(this.opts.dataDir, this.cfg);
    this.running = false;
    this.state.update({
      emergencyStop: true,
      paused: true,
      overall: "failed",
      lastError: "Emergency Stop activated",
    });
    this.emit();
    return this.state.get();
  }

  clearEmergencyStop(): SystemSnapshot {
    this.cfg = loadConfig(this.opts.dataDir);
    this.cfg.emergencyStop = false;
    // Keep paused until user unpauses
    saveConfig(this.opts.dataDir, this.cfg);
    this.state.update({ emergencyStop: false, lastError: undefined });
    this.emit();
    return this.state.get();
  }

  pause(): SystemSnapshot {
    this.cfg = loadConfig(this.opts.dataDir);
    this.cfg.paused = true;
    saveConfig(this.opts.dataDir, this.cfg);
    this.state.update({ paused: true });
    this.emit();
    return this.state.get();
  }

  resume(): SystemSnapshot {
    this.cfg = loadConfig(this.opts.dataDir);
    if (this.cfg.emergencyStop) {
      throw new AppError("EMERGENCY_STOP_ACTIVE", "Clear Emergency Stop before resume");
    }
    this.cfg.paused = false;
    saveConfig(this.opts.dataDir, this.cfg);
    this.state.update({ paused: false });
    this.emit();
    return this.state.get();
  }

  async health(): Promise<HealthReport> {
    const report = await runHealthCheck(this.opts.dataDir, { mockBridge: this.opts.mockBridge });
    this.applyHealth(report);
    this.emit();
    return report;
  }

  async repair(): Promise<RepairReport> {
    const report = await repairSystem(this.opts.dataDir, { onlyIfNeeded: false });
    await this.health();
    return report;
  }

  private applyHealth(h: HealthReport): void {
    this.state.update({
      chrome: h.chrome.ok ? "running" : h.chrome.found === false ? "not_configured" : "failed",
      extension: h.extension.connected ? "running" : h.extension.installed ? "failed" : "not_configured",
      nativeHost: h.nativeHost.registered ? "running" : "failed",
      llm: h.llm.paired ? "running" : "not_configured",
      lastError: h.ok ? undefined : h.primaryFailure,
    });
    if (!h.ok) {
      if (this.running) {
        this.state.update({ overall: "needs_attention" });
      }
    } else if (this.running) {
      this.state.update({
        chrome: "running",
        extension: "running",
        nativeHost: "running",
        overall: "ready",
      });
    }
  }

  private checkIntegrity(): { ok: boolean; error?: string } {
    try {
      const dataDir = this.opts.dataDir;
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const test = path.join(dataDir, ".write-test");
      fs.writeFileSync(test, "ok");
      fs.unlinkSync(test);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
