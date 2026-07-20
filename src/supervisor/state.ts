import fs from "node:fs";
import path from "node:path";

export type ComponentState = "stopped" | "starting" | "running" | "failed" | "not_configured";

export interface SystemSnapshot {
  overall: ComponentState | "ready" | "needs_attention";
  mcp: ComponentState;
  chrome: ComponentState;
  extension: ComponentState;
  nativeHost: ComponentState;
  llm: ComponentState;
  emergencyStop: boolean;
  paused: boolean;
  lastError?: string;
  currentTab?: string;
  activeWorkflow?: string;
  permissionMode?: string;
  updatedAt: string;
}

export function defaultSnapshot(): SystemSnapshot {
  return {
    overall: "stopped",
    mcp: "stopped",
    chrome: "not_configured",
    extension: "not_configured",
    nativeHost: "not_configured",
    llm: "not_configured",
    emergencyStop: false,
    paused: false,
    updatedAt: new Date().toISOString(),
  };
}

export class StateStore {
  private snap: SystemSnapshot = defaultSnapshot();

  constructor(private dataDir: string) {
    this.load();
  }

  path(): string {
    return path.join(this.dataDir, "runtime-state.json");
  }

  load(): SystemSnapshot {
    try {
      if (fs.existsSync(this.path())) {
        this.snap = { ...defaultSnapshot(), ...JSON.parse(fs.readFileSync(this.path(), "utf8")) };
      }
    } catch {
      this.snap = defaultSnapshot();
    }
    return this.snap;
  }

  get(): SystemSnapshot {
    return { ...this.snap };
  }

  update(partial: Partial<SystemSnapshot>): SystemSnapshot {
    this.snap = {
      ...this.snap,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    this.recomputeOverall();
    fs.writeFileSync(this.path(), JSON.stringify(this.snap, null, 2), "utf8");
    return this.get();
  }

  private recomputeOverall(): void {
    if (this.snap.emergencyStop) {
      this.snap.overall = "failed";
      return;
    }
    const required: ComponentState[] = [this.snap.mcp, this.snap.nativeHost];
    if (required.some((s) => s === "failed")) {
      this.snap.overall = "failed";
      return;
    }
    if (required.some((s) => s === "stopped" || s === "starting")) {
      this.snap.overall = "stopped";
      return;
    }
    if (
      this.snap.mcp === "running" &&
      this.snap.nativeHost === "running" &&
      this.snap.extension === "running"
    ) {
      this.snap.overall = "ready";
      return;
    }
    if (this.snap.mcp === "running") {
      this.snap.overall = "needs_attention";
      return;
    }
    this.snap.overall = "stopped";
  }
}
