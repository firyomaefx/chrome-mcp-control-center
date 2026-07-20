import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type WorkflowStatus = "idle" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface WorkflowStep {
  id: string;
  name: string;
  tool: string;
  args?: Record<string, unknown>;
  timeoutMs?: number;
  retryLimit?: number;
  requireApproval?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: WorkflowStatus;
  currentStep: number;
  history: Array<{ stepId: string; result: string; at: string }>;
  submitToken?: string;
  dryRun: boolean;
}

export class WorkflowEngine {
  private runs = new Map<string, WorkflowRun>();

  constructor(private dataDir: string) {
    fs.mkdirSync(path.join(dataDir, "workflows"), { recursive: true });
  }

  list(): Workflow[] {
    const dir = path.join(this.dataDir, "workflows");
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("run-"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Workflow);
  }

  save(wf: Omit<Workflow, "id" | "createdAt" | "updatedAt"> & { id?: string }): Workflow {
    const now = new Date().toISOString();
    const full: Workflow = {
      id: wf.id ?? crypto.randomUUID(),
      name: wf.name,
      steps: wf.steps,
      createdAt: now,
      updatedAt: now,
    };
    fs.writeFileSync(path.join(this.dataDir, "workflows", `${full.id}.json`), JSON.stringify(full, null, 2));
    return full;
  }

  start(workflowId: string, dryRun = false): WorkflowRun {
    const run: WorkflowRun = {
      id: crypto.randomUUID(),
      workflowId,
      status: "running",
      currentStep: 0,
      history: [],
      submitToken: crypto.randomBytes(8).toString("hex"),
      dryRun,
    };
    this.runs.set(run.id, run);
    this.persistRun(run);
    return run;
  }

  pause(runId: string): WorkflowRun | undefined {
    const r = this.runs.get(runId);
    if (!r) return undefined;
    r.status = "paused";
    this.persistRun(r);
    return r;
  }

  resume(runId: string): WorkflowRun | undefined {
    const r = this.runs.get(runId);
    if (!r) return undefined;
    r.status = "running";
    this.persistRun(r);
    return r;
  }

  stop(runId: string): WorkflowRun | undefined {
    const r = this.runs.get(runId);
    if (!r) return undefined;
    r.status = "cancelled";
    this.persistRun(r);
    return r;
  }

  /** Duplicate submission protection: same submitToken cannot be consumed twice */
  private consumed = new Set<string>();

  consumeSubmitToken(token: string): boolean {
    if (this.consumed.has(token)) return false;
    this.consumed.add(token);
    return true;
  }

  private persistRun(run: WorkflowRun): void {
    fs.writeFileSync(
      path.join(this.dataDir, "workflows", `run-${run.id}.json`),
      JSON.stringify(run, null, 2),
    );
  }
}
