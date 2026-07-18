import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import vm from "node:vm";
import type { Model, ThinkingLevel } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionContext,
  type ModelRegistry,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { parse } from "acorn";
import { Type } from "typebox";

const MAX_CONCURRENCY = 16;
const MAX_AGENTS = 1000;
export interface ModelTierConfig {
  tiers: Record<string, string>;
}

export interface WorkflowMetaPhase {
  title: string;
}

export interface WorkflowMeta {
  name: string;
  description: string;
  phases?: WorkflowMetaPhase[];
}

export interface WorkflowToolInput {
  script: string;
  args?: unknown;
  background?: boolean;
  maxAgents?: number;
  concurrency?: number;
  agentRetries?: number;
  tokenBudget?: number;
  resumeFromRunId?: string;
}

export interface WorkflowAgentSnapshot {
  id: number;
  label: string;
  status: "queued" | "running" | "done" | "error" | "skipped";
  phase?: string;
  prompt?: string;
  model?: string;
  result?: unknown;
  error?: string;
  cached?: boolean;
  tokens?: number;
  cost?: number;
  activity?: WorkflowAgentActivity[];
}

export interface WorkflowAgentActivity {
  type: "tool_call" | "tool_result";
  name: string;
  summary?: string;
  isError?: boolean;
}

export interface WorkflowSnapshot {
  name: string;
  description: string;
  phases: string[];
  currentPhase?: string;
  agents: WorkflowAgentSnapshot[];
  logs: string[];
  result?: unknown;
  durationMs?: number;
  agentCount: number;
  runningCount: number;
  doneCount: number;
  errorCount: number;
  tokens: number;
  cost: number;
}

interface JournalEntry {
  callIndex: number;
  hash: string;
  result: unknown;
  model?: string;
  tokens?: number;
  cost?: number;
  activity?: WorkflowAgentActivity[];
}

export type RunStatus = "running" | "paused" | "completed" | "failed" | "aborted";

export interface WorkflowRunResult {
  meta: WorkflowMeta;
  result: unknown;
  agentCount: number;
  durationMs: number;
  tokens: number;
  cost: number;
  journal: JournalEntry[];
}

export interface PersistedRunState {
  runId: string;
  workflowName: string;
  status: RunStatus;
  snapshot: WorkflowSnapshot;
  agents: WorkflowAgentSnapshot[];
  script: string;
  args?: unknown;
  journal: JournalEntry[];
  result?: WorkflowRunResult;
  error?: string;
  startedAt: string;
  updatedAt: string;
  sessionId?: string;
  ownerPid?: number;
}

export interface ManagedRun extends PersistedRunState {
  controller: AbortController;
  background: boolean;
}

interface WorkflowManagerOptions {
  cwd?: string;
  runsDir?: string;
  loadSavedWorkflow?: (name: string) => string | undefined;
  defaultAgentRetries?: number;
  agent?: (prompt: string, options: AgentCallOptions) => Promise<AgentRunResult>;
}

interface ExecOptions {
  maxAgents?: number;
  concurrency?: number;
  tokenBudget?: number;
  agentRetries?: number;
  externalSignal?: AbortSignal;
  confirm?: (question: string, options?: unknown) => Promise<unknown>;
  onProgress?: (snapshot: WorkflowSnapshot) => void;
  resumeJournal?: JournalEntry[];
  onJournal?: (journal: JournalEntry[]) => void;
}

interface AgentCallOptions {
  label?: string;
  phase?: string;
  tier?: string;
  model?: string;
  tools?: string[];
  disallowedTools?: string[];
}

type WorkflowAgentHandle = ((task: string, options?: AgentCallOptions) => Promise<unknown>) & PromiseLike<unknown>;

interface AgentRunResult {
  output: string;
  model: string;
  tokens: number;
  cost: number;
  activity?: WorkflowAgentActivity[];
}

interface ExecuteOptions extends ExecOptions {
  cwd: string;
  runId: string;
  signal: AbortSignal;
  modelRegistry?: ModelRegistry;
  modelRuntime?: ModelRuntime;
  mainModel?: string;
  resumeJournal?: JournalEntry[];
  loadSavedWorkflow?: (name: string) => string | undefined;
  agentRunner?: (prompt: string, options: AgentCallOptions) => Promise<AgentRunResult>;
}

type ProviderRegistration = Parameters<ModelRuntime["registerProvider"]>[1];

const workflowToolSchema = Type.Object({
  script: Type.String(),
  args: Type.Optional(Type.Any()),
  background: Type.Optional(Type.Boolean()),
  maxAgents: Type.Optional(Type.Number()),
  concurrency: Type.Optional(Type.Number()),
  agentRetries: Type.Optional(Type.Number()),
  tokenBudget: Type.Optional(Type.Number()),
  resumeFromRunId: Type.Optional(Type.String()),
});

export class WorkflowManager extends EventEmitter {
  private readonly cwd: string;
  private readonly runs = new Map<string, ManagedRun>();
  private readonly runsDir: string;
  private readonly loadSavedWorkflow?: (name: string) => string | undefined;
  private readonly defaultAgentRetries: number;
  private readonly agentRunner?: (prompt: string, options: AgentCallOptions) => Promise<AgentRunResult>;
  private modelRegistry?: ModelRegistry;
  private modelRuntimePromise?: Promise<ModelRuntime>;
  private readonly registeredProviders = new Map<string, ProviderRegistration>();
  private mainModel?: string;
  private sessionId?: string;

  constructor(options: WorkflowManagerOptions = {}) {
    super();
    this.cwd = options.cwd ?? process.cwd();
    this.loadSavedWorkflow = options.loadSavedWorkflow;
    this.defaultAgentRetries = options.defaultAgentRetries ?? 0;
    this.runsDir = options.runsDir ?? workflowRunsDir(this.cwd);
    this.agentRunner = options.agent;
    mkdirSync(this.runsDir, { recursive: true });
    this.recoverInterruptedRuns();
  }

  setMainModel(spec: string | undefined): void {
    this.mainModel = spec;
  }

  setModelRegistry(registry: ModelRegistry): void {
    this.modelRegistry = registry;
    this.registeredProviders.clear();
    for (const providerId of registry.getRegisteredProviderIds()) {
      const config = registry.getRegisteredProviderConfig(providerId);
      if (config) this.registeredProviders.set(providerId, config);
    }
    if (this.modelRuntimePromise) {
      void this.modelRuntimePromise.then((runtime) => this.applyRegisteredProviders(runtime));
    }
  }

  setSessionId(sessionId: string | undefined): void {
    this.sessionId = sessionId;
  }

  startInBackground(
    script: string,
    args?: unknown,
    options: ExecOptions = {},
  ): { runId: string; promise: Promise<WorkflowRunResult> } {
    const run = this.createRun(script, args, true);
    const promise = this.execute(run, options);
    return { runId: run.runId, promise };
  }

  runSync(script: string, args?: unknown, options: ExecOptions = {}): Promise<WorkflowRunResult> {
    return this.execute(this.createRun(script, args, false), options);
  }

  pause(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run || run.status !== "running") return false;
    run.status = "paused";
    run.updatedAt = new Date().toISOString();
    this.persist(run);
    run.controller.abort(new Error("Workflow paused"));
    this.emit("paused", { runId });
    return true;
  }

  stop(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run || (run.status !== "running" && run.status !== "paused")) return false;
    run.status = "aborted";
    run.updatedAt = new Date().toISOString();
    this.persist(run);
    run.controller.abort(new Error("Workflow stopped"));
    this.emit("stopped", { runId });
    return true;
  }

  async resume(runId: string): Promise<boolean> {
    const persisted = this.readRun(runId);
    if (!persisted || persisted.status !== "paused") return false;
    const run: ManagedRun = {
      ...persisted,
      status: "running",
      controller: new AbortController(),
      background: true,
      updatedAt: new Date().toISOString(),
      ownerPid: process.pid,
    };
    this.runs.set(runId, run);
    this.persist(run);
    void this.execute(run, { resumeJournal: persisted.journal }).catch(() => {});
    return true;
  }

  getRun(runId: string): ManagedRun | undefined {
    return this.runs.get(runId);
  }

  getSnapshot(runId: string): WorkflowSnapshot | null {
    return this.runs.get(runId)?.snapshot ?? this.readRun(runId)?.snapshot ?? null;
  }

  listRuns(): PersistedRunState[] {
    const runs = this.readAllRuns();
    const filtered = this.sessionId ? runs.filter((run) => run.sessionId === this.sessionId) : runs;
    return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  listAllRuns(): PersistedRunState[] {
    return this.readAllRuns().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  deleteRun(runId: string): boolean {
    if (!isSafeRunId(runId)) return false;
    const live = this.runs.get(runId);
    if (live?.status === "running") return false;
    this.runs.delete(runId);
    const path = this.runPath(runId);
    if (!existsSync(path)) return false;
    rmSync(path);
    return true;
  }

  private createRun(script: string, args: unknown, background: boolean): ManagedRun {
    const { meta } = parseWorkflowScript(script);
    const slug = meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
    const runId = `${slug || "workflow"}-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
    const now = new Date().toISOString();
    const run: ManagedRun = {
      runId,
      workflowName: meta.name,
      status: "running",
      snapshot: createSnapshot(meta),
      agents: [],
      script,
      args,
      journal: [],
      startedAt: now,
      updatedAt: now,
      sessionId: this.sessionId,
      ownerPid: process.pid,
      controller: new AbortController(),
      background,
    };
    this.runs.set(runId, run);
    this.persist(run);
    return run;
  }

  private async execute(run: ManagedRun, options: ExecOptions): Promise<WorkflowRunResult> {
    const externalAbort = () => run.controller.abort(options.externalSignal?.reason);
    options.externalSignal?.addEventListener("abort", externalAbort, { once: true });
    try {
      const result = await executeWorkflow(run.script, run.args, {
        ...options,
        cwd: this.cwd,
        runId: run.runId,
        signal: run.controller.signal,
        modelRegistry: this.modelRegistry,
        modelRuntime: this.agentRunner ? undefined : await this.getModelRuntime(),
        mainModel: this.mainModel,
        loadSavedWorkflow: this.loadSavedWorkflow,
        agentRunner: this.agentRunner,
        agentRetries: options.agentRetries ?? this.defaultAgentRetries,
        resumeJournal: options.resumeJournal,
        onJournal: (journal) => {
          run.journal = journal;
          run.updatedAt = new Date().toISOString();
          this.persist(run);
        },
        onProgress: (snapshot) => {
          run.snapshot = snapshot;
          run.agents = snapshot.agents;
          run.updatedAt = new Date().toISOString();
          this.persist(run);
          options.onProgress?.(snapshot);
          this.emit("progress", { runId: run.runId, snapshot });
        },
      });
      run.status = "completed";
      run.result = result;
      run.journal = result.journal;
      run.snapshot.result = result.result;
      run.snapshot.durationMs = result.durationMs;
      run.updatedAt = new Date().toISOString();
      this.persist(run);
      this.emit("complete", { runId: run.runId, result });
      return result;
    } catch (error) {
      if (run.status !== "paused" && run.status !== "aborted") {
        run.status = "failed";
        run.error = error instanceof Error ? error.message : String(error);
        run.updatedAt = new Date().toISOString();
        this.persist(run);
        this.emit("error", { runId: run.runId, error });
      }
      throw error;
    } finally {
      options.externalSignal?.removeEventListener("abort", externalAbort);
    }
  }

  private getModelRuntime(): Promise<ModelRuntime> {
    this.modelRuntimePromise ??= ModelRuntime.create().then((runtime) => {
      this.applyRegisteredProviders(runtime);
      return runtime;
    });
    return this.modelRuntimePromise;
  }

  private applyRegisteredProviders(runtime: ModelRuntime): void {
    for (const [providerId, config] of this.registeredProviders) runtime.registerProvider(providerId, config);
  }

  private persist(run: ManagedRun): void {
    const persisted: PersistedRunState = {
      runId: run.runId,
      workflowName: run.workflowName,
      status: run.status,
      snapshot: run.snapshot,
      agents: run.snapshot.agents,
      script: run.script,
      args: run.args,
      journal: run.journal,
      result: run.result,
      error: run.error,
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
      sessionId: run.sessionId,
      ownerPid: run.ownerPid,
    };
    const path = this.runPath(run.runId);
    const temp = `${path}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");
    renameSync(temp, path);
  }

  private recoverInterruptedRuns(): void {
    for (const run of this.readAllRuns()) {
      if (run.status !== "running") continue;
      if (run.ownerPid && isProcessAlive(run.ownerPid)) continue;
      run.status = "paused";
      run.updatedAt = new Date().toISOString();
      const path = this.runPath(run.runId);
      writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    }
  }

  private readAllRuns(): PersistedRunState[] {
    if (!existsSync(this.runsDir)) return [];
    const runs: PersistedRunState[] = [];
    for (const entry of readdirSync(this.runsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const run = JSON.parse(readFileSync(join(this.runsDir, entry.name), "utf8"));
        if (run && typeof run.runId === "string" && isSafeRunId(run.runId)) runs.push(run as PersistedRunState);
      } catch {
        // A corrupt run does not hide valid history.
      }
    }
    return runs;
  }

  private readRun(runId: string): PersistedRunState | undefined {
    if (!isSafeRunId(runId)) return undefined;
    try {
      return JSON.parse(readFileSync(this.runPath(runId), "utf8")) as PersistedRunState;
    } catch {
      return undefined;
    }
  }

  private runPath(runId: string): string {
    return join(this.runsDir, `${runId}.json`);
  }
}

export function createWorkflowTool(options: { cwd?: string; manager: WorkflowManager }) {
  const manager = options.manager;
  return defineTool({
    name: "workflow",
    label: "Workflow",
    description: "Execute an approved JavaScript workflow that coordinates multiple Pi subagents.",
    promptSnippet: "Run a model-routed, resumable multi-agent JavaScript workflow.",
    promptGuidelines: [
      "Use workflow only when the user explicitly asks for a workflow, fan-out, or multi-agent orchestration.",
      "Pass raw JavaScript in script, beginning with export const meta = { name, description, phases: [{ title: 'Inspect' }] }.",
      "Available globals are agent(prompt, opts), agent(persona, opts)(task), parallel(thunks), pipeline(items, ...stages), phase(title, optionalCallback), log(message), retry(thunk, { attempts }), gate(thunk, validator, { attempts }), checkpoint(question), budget, args, and cwd.",
      "parallel() receives functions, not promises: await parallel(items.map(item => () => agent(...))).",
      "Every agent needs a unique short label and a semantic opts.tier. End with one synthesizer agent and return a compact JSON-serializable result.",
      "Do not use imports, require, process, filesystem APIs, Date.now, Math.random, or new Date in workflow JavaScript.",
      "Runs are background by default. The completed result returns to the conversation automatically.",
    ],
    parameters: workflowToolSchema,
    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      if (params.resumeFromRunId) {
        const resumed = await manager.resume(params.resumeFromRunId);
        if (!resumed) throw new Error(`Workflow ${params.resumeFromRunId} is not resumable.`);
        return {
          content: [{ type: "text" as const, text: `Workflow ${params.resumeFromRunId} resumed in the background.` }],
          details: { runId: params.resumeFromRunId, background: true },
        };
      }
      if (params.background ?? true) {
        const { runId, promise } = manager.startInBackground(params.script, params.args, {
          maxAgents: params.maxAgents,
          concurrency: params.concurrency,
          tokenBudget: params.tokenBudget,
          agentRetries: params.agentRetries,
        });
        void promise.catch(() => {});
        return {
          content: [
            {
              type: "text" as const,
              text: `Workflow started in the background. Run ID: ${runId}. Its result will return to this conversation.`,
            },
          ],
          details: { runId, background: true },
        };
      }
      const result = await manager.runSync(params.script, params.args, {
        maxAgents: params.maxAgents,
        concurrency: params.concurrency,
        tokenBudget: params.tokenBudget,
        agentRetries: params.agentRetries,
        externalSignal: signal,
        onProgress: (snapshot) =>
          onUpdate?.({
            content: [{ type: "text" as const, text: progressText(snapshot) }],
            details: snapshot,
          }),
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Workflow ${result.meta.name} completed with ${result.agentCount} agents.\n\n${JSON.stringify(result.result, null, 2)}`,
          },
        ],
        details: result,
      };
    },
  });
}

export function parseWorkflowScript(script: string): { meta: WorkflowMeta; body: string } {
  if (typeof script !== "string" || !script.trim()) throw new Error("Workflow script is empty.");
  const program = parse(script, {
    ecmaVersion: "latest",
    sourceType: "module",
    allowReturnOutsideFunction: true,
  }) as any;
  const first = program.body[0];
  if (first?.type !== "ExportNamedDeclaration" || first.declaration?.type !== "VariableDeclaration") {
    throw new Error("Workflow script must begin with `export const meta = { ... }`.");
  }
  const declaration = first.declaration.declarations?.[0];
  if (declaration?.id?.name !== "meta" || !declaration.init) {
    throw new Error("Workflow script must begin with `export const meta = { ... }`.");
  }
  const raw = literalValue(declaration.init);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Workflow meta must be an object.");
  const meta = raw as Record<string, unknown>;
  if (typeof meta.name !== "string" || !meta.name.trim()) throw new Error("Workflow meta.name is required.");
  if (typeof meta.description !== "string" || !meta.description.trim()) {
    throw new Error("Workflow meta.description is required.");
  }
  let phases: WorkflowMetaPhase[] | undefined;
  if (meta.phases !== undefined) {
    if (!Array.isArray(meta.phases)) throw new Error("Workflow meta.phases must be an array.");
    phases = meta.phases.map((phase) => {
      const title = typeof phase === "string" ? phase : (phase as any)?.title;
      if (typeof title !== "string" || !title.trim()) {
        throw new Error("Each workflow phase needs a title.");
      }
      return { title: title.trim() };
    });
  }
  const remaining = program.body.slice(1);
  const onlyStatement = remaining.length === 1 ? remaining[0] : undefined;
  const runDeclaration = onlyStatement?.type === "ExportDefaultDeclaration"
    ? onlyStatement.declaration
    : onlyStatement?.type === "FunctionDeclaration" && onlyStatement.id?.name === "run"
      ? onlyStatement
      : undefined;
  const runBody =
    (runDeclaration?.type === "FunctionDeclaration" || runDeclaration?.type === "FunctionExpression") &&
    runDeclaration.body?.type === "BlockStatement"
      ? runDeclaration.body
      : runDeclaration?.type === "ArrowFunctionExpression" && runDeclaration.body?.type === "BlockStatement"
        ? runDeclaration.body
        : undefined;
  const trailing = remaining.at(-1);
  const callsRun = trailing?.type === "ExpressionStatement"
    && trailing.expression?.type === "CallExpression"
    && trailing.expression.callee?.type === "Identifier"
    && trailing.expression.callee.name === "run"
    && trailing.expression.arguments?.length === 0;
  const topLevelBody = callsRun
    ? `${script.slice(first.end, trailing.start)}return await run();${script.slice(trailing.end)}`
    : `${script.slice(0, first.start)}${script.slice(first.end)}`;
  return {
    meta: { name: meta.name.trim(), description: meta.description.trim(), phases },
    body: runBody
      ? script.slice(runBody.start + 1, runBody.end - 1)
      : topLevelBody,
  };
}

export function buildForcedWorkflowPrompt(prompt: string, directive?: string): string {
  return [
    "The user explicitly requested a dynamic workflow. You must call the workflow tool exactly once.",
    "Design the JavaScript orchestration, then pass it as the tool's script argument. Metadata phases must use [{ title: 'Phase name' }]. Prefer top-level orchestration with phase('Name'); then await agent('complete task prompt', { label: 'name', tier: 'scout' }). agent() may also define a reusable persona that is later called with a task, and phase('Name', async () => ...) is accepted. If using a run() function, export it as default or finish with await run(). Do not perform the task with ordinary tools in this parent turn.",
    directive ?? "",
    "User request:",
    prompt,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function saveModelTierConfig(config: ModelTierConfig, path = modelTierPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function loadModelTierConfig(path = modelTierPath()): ModelTierConfig {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed.tiers === "object" ? parsed : { tiers: {} };
  } catch {
    return { tiers: {} };
  }
}

export function deliverText(run: ManagedRun): string {
  const result = run.result;
  const summary = workflowResultText(result?.result);
  return [
    `✓ Background workflow "${run.workflowName}" finished (${result?.agentCount ?? run.snapshot.agentCount} agents, ${run.snapshot.tokens} tokens, $${run.snapshot.cost.toFixed(4)}).`,
    "",
    summary,
    "",
    `Run ID: ${run.runId}`,
    `Inspect details, agent evidence, and exports with /workflow status ${run.runId}`,
  ].join("\n");
}

export function workflowResultText(value: unknown): string {
  if (value === undefined || value === null) return "No result.";
  if (typeof value === "string") return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ["report", "markdown", "content", "text", "summary"]) {
      if (typeof record[key] === "string" && record[key].trim()) return record[key] as string;
    }
  }
  return JSON.stringify(value, null, 2);
}

export function renderPanel(manager: WorkflowManager, theme: Theme, _width?: number): string[] {
  const active = manager.listRuns().filter((run) => run.status === "running" || run.status === "paused");
  if (!active.length) return [];
  return [
    theme.bold(`Workflows running (${active.length}):`),
    ...active.map((run) => {
      const snap = manager.getSnapshot(run.runId) ?? run.snapshot;
      const icon = run.status === "paused" ? "⏸" : "◆";
      const phase = snap.currentPhase ? ` · ${snap.currentPhase}` : "";
      return `  ${icon} ${run.workflowName}  ${snap.doneCount}/${snap.agentCount} agents${phase}`;
    }),
    theme.fg("dim", "  /workflow active — inspect runs"),
  ];
}

async function executeWorkflow(script: string, args: unknown, options: ExecuteOptions): Promise<WorkflowRunResult> {
  const started = Date.now();
  const { meta, body } = parseWorkflowScript(script);
  const snapshot = createSnapshot(meta);
  const maxAgents = clampInteger(options.maxAgents, 1, MAX_AGENTS, MAX_AGENTS);
  const concurrency = clampInteger(options.concurrency, 1, MAX_CONCURRENCY, 4);
  const retries = clampInteger(options.agentRetries, 0, 3, 0);
  const semaphore = new Semaphore(concurrency);
  const journal: JournalEntry[] = [];
  const cached = new Map((options.resumeJournal ?? []).map((entry) => [entry.callIndex, entry]));
  let cachePrefixValid = true;
  let callIndex = 0;
  let currentPhase = meta.phases?.[0]?.title;

  const update = () => {
    recompute(snapshot);
    options.onProgress?.(structuredClone(snapshot));
  };

  const spawnAgent = async (prompt: string, callOptions: AgentCallOptions = {}): Promise<unknown> => {
    if (options.signal.aborted) throw abortError(options.signal.reason);
    const index = callIndex++;
    if (index >= maxAgents) throw new Error(`Workflow exceeded its ${maxAgents}-agent cap.`);
    const label = callOptions.label?.trim() || `agent ${index + 1}`;
    const phaseName = callOptions.phase ?? currentPhase;
    const fingerprint = hashCall(prompt, callOptions);
    const prior = cached.get(index);
    const row: WorkflowAgentSnapshot = { id: index + 1, label, status: "queued", phase: phaseName, prompt };
    snapshot.agents.push(row);
    update();

    if (cachePrefixValid && prior?.callIndex === index && prior.hash === fingerprint) {
      row.status = "done";
      row.cached = true;
      row.result = prior.result;
      row.model = prior.model;
      row.tokens = prior.tokens;
      row.cost = prior.cost;
      row.activity = prior.activity;
      journal.push(prior);
      options.onJournal?.([...journal]);
      update();
      return prior.result;
    }
    cachePrefixValid = false;

    return semaphore.run(async () => {
      if (options.signal.aborted) throw abortError(options.signal.reason);
      row.status = "running";
      update();
      let lastError: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const result = options.agentRunner
            ? await options.agentRunner(prompt, callOptions)
            : await runAgent(prompt, callOptions, options);
          if (options.signal.aborted) throw abortError(options.signal.reason);
          row.status = "done";
          row.result = result.output;
          row.model = result.model;
          row.tokens = result.tokens;
          row.cost = result.cost;
          row.activity = result.activity;
          const entry: JournalEntry = {
            callIndex: index,
            hash: fingerprint,
            result: result.output,
            model: result.model,
            tokens: result.tokens,
            cost: result.cost,
            activity: result.activity,
          };
          journal.push(entry);
          options.onJournal?.([...journal]);
          update();
          if (options.tokenBudget && snapshot.tokens > options.tokenBudget) {
            throw new Error(`Workflow exceeded its ${options.tokenBudget}-token budget.`);
          }
          return result.output;
        } catch (error) {
          if (options.signal.aborted) throw abortError(options.signal.reason);
          lastError = error;
        }
      }
      row.status = "error";
      row.error = lastError instanceof Error ? lastError.message : String(lastError);
      update();
      return null;
    });
  };

  const agent = (prompt: string, callOptions: AgentCallOptions = {}): WorkflowAgentHandle => {
    let direct: Promise<unknown> | undefined;
    const handle = ((task: string, overrides: AgentCallOptions = {}) =>
      spawnAgent(`${prompt}\n\nTask:\n${String(task)}`, { ...callOptions, ...overrides })) as WorkflowAgentHandle;
    handle.then = (onfulfilled, onrejected) => {
      direct ??= spawnAgent(prompt, callOptions);
      return direct.then(onfulfilled, onrejected);
    };
    return handle;
  };

  const parallel = async (thunks: Array<() => Promise<unknown>>): Promise<unknown[]> => Promise.all(thunks.map((fn) => fn()));
  const pipeline = async (items: unknown[], ...stages: Array<(value: unknown, original: unknown, index: number) => unknown>) =>
    Promise.all(
      items.map(async (original, index) => {
        let value = original;
        for (const stage of stages) value = await stage(value, original, index);
        return value;
      }),
    );
  const phase = <T>(title: string, operation?: () => T | Promise<T>): T | Promise<T> | undefined => {
    currentPhase = title;
    snapshot.currentPhase = title;
    snapshot.logs.push(`phase: ${title}`);
    update();
    return typeof operation === "function" ? operation() : undefined;
  };
  const log = (message: unknown) => {
    snapshot.logs.push(String(message));
    update();
  };
  const retry = async (thunk: () => Promise<unknown>, retryOptions: { attempts?: number } = {}) => {
    const attempts = clampInteger(retryOptions.attempts, 1, 10, 2);
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await thunk();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };
  const gate = async (
    thunk: () => Promise<unknown>,
    validator: (value: unknown) => boolean | Promise<boolean>,
    gateOptions: { attempts?: number } = {},
  ) => retry(async () => {
    const value = await thunk();
    if (!(await validator(value))) throw new Error("Workflow gate rejected the result.");
    return value;
  }, gateOptions);
  const checkpoint = async (question: string, checkpointOptions?: unknown) => {
    if (!options.confirm) throw new Error("This workflow checkpoint requires interactive mode.");
    return options.confirm(question, checkpointOptions);
  };
  const budget = {
    total: options.tokenBudget ?? null,
    used: () => snapshot.tokens,
    remaining: () => (options.tokenBudget ? Math.max(0, options.tokenBudget - snapshot.tokens) : Number.POSITIVE_INFINITY),
  };
  const nestedWorkflow = async (name: string, nestedArgs?: unknown) => {
    const nested = options.loadSavedWorkflow?.(name);
    if (!nested) throw new Error(`Saved workflow "${name}" was not found.`);
    const result = await executeWorkflow(nested, nestedArgs, { ...options, runId: `${options.runId}-${name}`, resumeJournal: [] });
    return result.result;
  };

  const context = vm.createContext({
    agent,
    parallel,
    pipeline,
    phase,
    log,
    retry,
    gate,
    checkpoint,
    workflow: nestedWorkflow,
    budget,
    args,
    cwd: options.cwd,
    console: Object.freeze({ log }),
  });
  const executable = new vm.Script(`(async () => {\n"use strict";\n${body}\n})()`, {
    filename: `workflow:${meta.name}`,
  });
  const result = await executable.runInContext(context, { timeout: 1000 });
  if (callIndex === 0) throw new Error("Workflow scripts must call agent() at least once.");
  assertJsonSerializable(result);
  snapshot.result = result;
  snapshot.durationMs = Date.now() - started;
  update();
  return {
    meta,
    result,
    agentCount: snapshot.agentCount,
    durationMs: snapshot.durationMs,
    tokens: snapshot.tokens,
    cost: snapshot.cost,
    journal: journal.sort((a, b) => a.callIndex - b.callIndex),
  };
}

async function runAgent(prompt: string, options: AgentCallOptions, run: ExecuteOptions): Promise<AgentRunResult> {
  const requested = options.model ?? (options.tier ? loadModelTierConfig().tiers[options.tier] : undefined) ?? run.mainModel;
  if (!requested) throw new Error("No model route was selected for this workflow agent.");
  const resolved = resolveModel(requested, run.modelRuntime);
  if (!resolved) throw new Error(`Workflow model "${requested}" is unavailable.`);
  const { model, thinking, spec } = resolved;
  const sessionManager = SessionManager.inMemory();
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(run.cwd, agentDir);
  const resourceLoader = new DefaultResourceLoader({
    cwd: run.cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd: run.cwd,
    model,
    thinkingLevel: thinking,
    modelRuntime: run.modelRuntime,
    resourceLoader,
    sessionManager,
    settingsManager,
    ...(options.tools ? { tools: options.tools } : {}),
    ...(options.disallowedTools ? { excludeTools: options.disallowedTools } : {}),
  });
  const abort = () => void session.abort();
  run.signal.addEventListener("abort", abort, { once: true });
  try {
    await session.prompt(prompt, { source: "extension" });
    const output = lastAssistantText(session.messages);
    if (!output) throw new Error("Subagent returned no text result.");
    const stats = session.getSessionStats();
    return {
      output,
      model: spec,
      tokens: stats.tokens.total,
      cost: stats.cost,
      activity: extractAgentActivity(session.messages),
    };
  } finally {
    run.signal.removeEventListener("abort", abort);
    session.dispose();
  }
}

function resolveModel(
  requested: string,
  runtime: ModelRuntime | undefined,
): { model: Model<any>; thinking: ThinkingLevel; spec: string } | undefined {
  if (!runtime) return undefined;
  let spec = requested;
  let thinking: ThinkingLevel = "medium";
  const suffix = requested.match(/:(minimal|low|medium|high|xhigh|max)$/);
  if (suffix) {
    thinking = suffix[1] as ThinkingLevel;
    spec = requested.slice(0, -suffix[0].length);
  }
  const slash = spec.indexOf("/");
  if (slash < 1) return undefined;
  const model = runtime.getModel(spec.slice(0, slash), spec.slice(slash + 1));
  return model ? { model, thinking, spec: `${spec}:${thinking}` } : undefined;
}

function lastAssistantText(messages: readonly any[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    if (message.stopReason === "error") throw new Error(message.errorMessage ?? "Subagent request failed.");
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .filter((part: any) => part?.type === "text" && typeof part.text === "string")
        .map((part: any) => part.text)
        .join("\n");
    }
  }
  return "";
}

function extractAgentActivity(messages: readonly any[]): WorkflowAgentActivity[] {
  const activity: WorkflowAgentActivity[] = [];
  for (const message of messages) {
    if (message?.role === "assistant" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part?.type !== "toolCall" || typeof part.name !== "string") continue;
        const args = part.arguments && Object.keys(part.arguments).length ? JSON.stringify(part.arguments) : undefined;
        activity.push({ type: "tool_call", name: part.name, summary: truncateActivity(args) });
      }
      continue;
    }
    if (message?.role !== "toolResult" || typeof message.toolName !== "string") continue;
    const text = typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content.filter((part: any) => part?.type === "text").map((part: any) => part.text).join("\n")
        : undefined;
    activity.push({
      type: "tool_result",
      name: message.toolName,
      summary: truncateActivity(text),
      isError: message.isError,
    });
  }
  return activity.slice(-20);
}

function truncateActivity(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 500 ? `${text.slice(0, 500)}…` : text || undefined;
}

function literalValue(node: any): unknown {
  switch (node.type) {
    case "Literal":
      return node.value;
    case "ObjectExpression": {
      const object: Record<string, unknown> = {};
      for (const property of node.properties) {
        if (property.type !== "Property" || property.computed || property.kind !== "init") {
          throw new Error("Workflow meta must contain plain literal properties.");
        }
        const key = property.key.type === "Identifier" ? property.key.name : property.key.value;
        if (typeof key !== "string") throw new Error("Workflow meta keys must be strings.");
        object[key] = literalValue(property.value);
      }
      return object;
    }
    case "ArrayExpression":
      return node.elements.map((element: any) => literalValue(element));
    case "TemplateLiteral":
      if (node.expressions.length) throw new Error("Workflow meta templates cannot contain expressions.");
      return node.quasis.map((part: any) => part.value.cooked).join("");
    default:
      throw new Error("Workflow meta values must be literals.");
  }
}

function createSnapshot(meta: WorkflowMeta): WorkflowSnapshot {
  return {
    name: meta.name,
    description: meta.description,
    phases: meta.phases?.map((phase) => phase.title) ?? [],
    currentPhase: meta.phases?.[0]?.title,
    agents: [],
    logs: [],
    agentCount: 0,
    runningCount: 0,
    doneCount: 0,
    errorCount: 0,
    tokens: 0,
    cost: 0,
  };
}

function recompute(snapshot: WorkflowSnapshot): void {
  snapshot.agentCount = snapshot.agents.length;
  snapshot.runningCount = snapshot.agents.filter((agent) => agent.status === "running").length;
  snapshot.doneCount = snapshot.agents.filter((agent) => agent.status === "done").length;
  snapshot.errorCount = snapshot.agents.filter((agent) => agent.status === "error").length;
  snapshot.tokens = snapshot.agents.reduce((sum, agent) => sum + (agent.tokens ?? 0), 0);
  snapshot.cost = snapshot.agents.reduce((sum, agent) => sum + (agent.cost ?? 0), 0);
}

function hashCall(prompt: string, options: AgentCallOptions): string {
  return createHash("sha256").update(JSON.stringify({ prompt, options })).digest("hex");
}

function workflowRunsDir(cwd: string): string {
  const key = createHash("sha256").update(cwd).digest("hex").slice(0, 16);
  return join(homedir(), ".pi", "workflows", "projects", key, "runs");
}

function modelTierPath(): string {
  return join(homedir(), ".pi", "workflows", "model-tiers.json");
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function abortError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("Workflow aborted.");
}

function isSafeRunId(runId: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,127}$/i.test(runId);
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function progressText(snapshot: WorkflowSnapshot): string {
  return `${snapshot.name}: ${snapshot.doneCount}/${snapshot.agentCount} agents complete${snapshot.currentPhase ? ` · ${snapshot.currentPhase}` : ""}`;
}

function assertJsonSerializable(value: unknown): void {
  if (value === undefined) return;
  try {
    if (JSON.stringify(value) === undefined) throw new Error("value has no JSON representation");
  } catch (error) {
    throw new Error(
      `Workflow result must be JSON-serializable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await operation();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
