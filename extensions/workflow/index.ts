import {
  SettingsManager,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  buildForcedWorkflowPrompt,
  createWorkflowTool,
  saveModelTierConfig,
  WorkflowManager,
  type WorkflowToolInput,
} from "./runtime.js";
import {
  loadWorkflowControlSettings,
  profileLimits,
  saveWorkflowControlSettings,
} from "./config.js";
import { discoverWorkflowFiles, loadWorkflowFile } from "./discovery.js";
import {
  routeSpec,
  scopeModelCandidates,
  suggestWorkflowSettings,
  toModelCandidates,
  toModelTierConfig,
  workflowRoleGuideline,
} from "./profiles.js";
import { applyWorkflowLimits, createWorkflowPreview } from "./preview.js";
import {
  WORKFLOW_PROFILE_NAMES,
  WORKFLOW_ROLES,
  WORKFLOW_THINKING_LEVELS,
  type SavedWorkflowFile,
  type WorkflowApprovalMode,
  type WorkflowControlSettings,
  type WorkflowModelCandidate,
  type WorkflowProfileName,
  type WorkflowRole,
  type WorkflowThinkingLevel,
} from "./types.js";
import { WorkflowModelSelector } from "./model-selector.js";
import { requestWorkflowApproval } from "./approval.js";
import { formatWorkflowDoctor, formatWorkflowHelp } from "./help.js";
import { openWorkflowRunBrowser } from "./run-browser.js";
import { installWorkflowResultDelivery, installWorkflowTaskPanel } from "./ui.js";

const USAGE = [
  "Usage:",
  "  /workflow                         open the workflow hub",
  "  /workflow run <prompt>            generate and run a workflow",
  "  /workflow saved <name> [json]     run a saved JavaScript workflow",
  "  /workflow list                    list saved workflow files",
  "  /workflow runs                    open the interactive run browser",
  "  /workflow active | history        open runs with a status filter",
  "  /workflow status <id>             inspect one run",
  "  /workflow pause|resume|stop <id>  control a run",
  "  /workflow remove <id>             delete a persisted run",
  "  /workflow setup                   configure profile and model routes",
  "  /workflow settings                show effective settings",
  "  /workflow doctor                  verify readiness without model calls",
  "  /workflow help                    show the complete user guide",
].join("\n");

const PROFILE_LABELS: Record<WorkflowProfileName, string> = {
  lean: "Lean — small fan-out, lowest practical cost",
  balanced: "Balanced — deliberate routing for everyday work (recommended)",
  deep: "Deep — stronger models and wider fan-out",
  custom: "Custom — choose every route and limit",
};

export interface WorkflowExtensionOptions {
  cwd?: string;
  runsDir?: string;
}

export function createWorkflowExtension(options: WorkflowExtensionOptions = {}): (pi: ExtensionAPI) => void {
  return function workflowExtension(pi: ExtensionAPI): void {
    const cwd = options.cwd ?? process.cwd();
    const manager = new WorkflowManager({
      cwd,
      runsDir: options.runsDir,
      loadSavedWorkflow: (name) => loadWorkflowFile(cwd, name)?.script,
    });
    const workflowTool = createWorkflowTool({ cwd, manager });
    const upstreamExecute = workflowTool.execute.bind(workflowTool);
    const upstreamGuidelines = [...(workflowTool.promptGuidelines ?? [])];

    Object.defineProperty(workflowTool, "promptGuidelines", {
      configurable: true,
      enumerable: true,
      get() {
        const settings = loadWorkflowControlSettings(cwd);
        return settings
          ? [...upstreamGuidelines, workflowRoleGuideline(settings)]
          : [...upstreamGuidelines, "Workflow model roles are not configured. Ask the user to run /workflow setup first."];
      },
    });

    workflowTool.execute = async (toolCallId, input, signal, onUpdate, ctx) => {
      const settings = requireConfiguredSettings(cwd);
      requireTrustedProject(ctx);
      assertConfiguredModels(settings, toModelCandidates(ctx.modelRegistry.getAvailable()));
      saveModelTierConfig(toModelTierConfig(settings));

      const limited = applyWorkflowLimits(input as WorkflowToolInput, settings);
      const preview = createWorkflowPreview(limited.script, settings, "generated", limited);
      await requireWorkflowApproval(ctx, preview, true);
      return upstreamExecute(toolCallId, limited, signal, onUpdate, ctx);
    };

    pi.registerTool(workflowTool);
    registerWorkflowCommand(pi, manager, cwd, workflowTool.name);

    pi.on("session_start", (_event, ctx) => {
      manager.setMainModel(ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined);
      manager.setModelRegistry(ctx.modelRegistry);
      try {
        manager.setSessionId(ctx.sessionManager?.getSessionId());
      } catch {
        manager.setSessionId(undefined);
      }

      if (ctx.isProjectTrusted()) {
        const active = pi.getActiveTools();
        if (!active.includes(workflowTool.name)) pi.setActiveTools([...active, workflowTool.name]);
      }
      installWorkflowResultDelivery(pi, manager);
      if (ctx.mode === "tui") installWorkflowTaskPanel(manager, ctx.ui);
    });
  };
}

export default createWorkflowExtension();

function registerWorkflowCommand(
  pi: ExtensionAPI,
  manager: WorkflowManager,
  cwd: string,
  toolName: string,
): void {
  pi.registerCommand("workflow", {
    description: "Run and manage dynamic workflows with explicit model profiles and approval",
    async handler(rawArgs, ctx) {
      const args = rawArgs.trim();
      if (!args) {
        await openWorkflowHub(pi, manager, cwd, toolName, ctx);
        return;
      }

      const [command = "", ...rest] = args.split(/\s+/);
      const tail = args.slice(command.length).trim();
      switch (command.toLowerCase()) {
        case "run":
          await runGeneratedWorkflow(pi, cwd, toolName, tail, ctx);
          return;
        case "saved":
          await runSavedWorkflow(manager, cwd, rest[0], tail.slice(rest[0]?.length ?? 0).trim(), ctx);
          return;
        case "list":
          await showSavedWorkflows(pi, cwd);
          return;
        case "runs":
          if (ctx.hasUI) await openWorkflowRunBrowser(manager, cwd, ctx);
          else await showRuns(pi, manager, false);
          return;
        case "active":
          if (ctx.hasUI) await openWorkflowRunBrowser(manager, cwd, ctx, { initialFilter: "active" });
          else await showRuns(pi, manager, true);
          return;
        case "history":
          if (ctx.hasUI) await openWorkflowRunBrowser(manager, cwd, ctx);
          else await showRuns(pi, manager, false);
          return;
        case "status":
          if (ctx.hasUI && rest[0]) await openWorkflowRunBrowser(manager, cwd, ctx, { initialRunId: rest[0] });
          else await showRunStatus(pi, manager, rest[0]);
          return;
        case "pause":
          notifyControl(ctx, rest[0], "pause", (id) => manager.pause(id));
          return;
        case "resume":
          await resumeRun(manager, rest[0], ctx);
          return;
        case "stop":
          notifyControl(ctx, rest[0], "stop", (id) => manager.stop(id));
          return;
        case "remove":
        case "rm":
          notifyControl(ctx, rest[0], "remove", (id) => manager.deleteRun(id));
          return;
        case "setup":
          await setupWorkflow(cwd, ctx, normalizeProfile(rest[0]));
          return;
        case "settings":
          await showSettings(pi, cwd);
          return;
        case "doctor":
          await showDoctor(pi, manager, cwd, toolName, ctx);
          return;
        case "help":
          await print(pi, formatWorkflowHelp());
          return;
        default:
          ctx.ui.notify(`Unknown workflow action "${command}".`, "warning");
          await print(pi, USAGE);
      }
    },
  });
}

async function openWorkflowHub(
  pi: ExtensionAPI,
  manager: WorkflowManager,
  cwd: string,
  toolName: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!ctx.hasUI) {
    await print(pi, USAGE);
    return;
  }
  const action = await openWorkflowRunBrowser(manager, cwd, ctx);
  switch (action) {
    case "new": {
      const prompt = await ctx.ui.editor("What should the workflow accomplish?", "");
      if (prompt?.trim()) await runGeneratedWorkflow(pi, cwd, toolName, prompt.trim(), ctx);
      return;
    }
    case "saved": {
      const workflows = discoverWorkflowFiles(cwd);
      if (!workflows.length) return ctx.ui.notify("No saved .js workflows found.", "info");
      const labels = workflows.map((workflow) => workflowLabel(workflow));
      const selected = await ctx.ui.select("Saved workflow", labels);
      const workflow = workflows[labels.indexOf(selected ?? "")];
      if (workflow) await runSavedWorkflow(manager, cwd, workflow.id, "", ctx);
      return;
    }
    case "setup":
      await setupWorkflow(cwd, ctx);
      return;
    case "settings":
      await showSettings(pi, cwd);
      return;
  }
}

async function runGeneratedWorkflow(
  pi: ExtensionAPI,
  cwd: string,
  toolName: string,
  prompt: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!prompt) return ctx.ui.notify("Usage: /workflow run <prompt>", "warning");
  requireTrustedProject(ctx);
  let settings = loadWorkflowControlSettings(cwd);
  if (!settings) {
    if (!ctx.hasUI) throw new Error("Workflow setup is required. Run /workflow setup in interactive mode.");
    ctx.ui.notify("Choose a model profile before the first workflow run.", "info");
    settings = await setupWorkflow(cwd, ctx);
    if (!settings) return;
  }
  assertConfiguredModels(settings, toModelCandidates(ctx.modelRegistry.getAvailable()));
  saveModelTierConfig(toModelTierConfig(settings));

  const active = pi.getActiveTools();
  if (!active.includes(toolName)) pi.setActiveTools([...active, toolName]);
  const directive = [
    workflowRoleGuideline(settings),
    "The workflow tool will show the completed JavaScript plan to the user for approval before execution.",
  ].join(" ");
  const forcedPrompt = buildForcedWorkflowPrompt(prompt, directive);
  ctx.ui.notify(`Preparing ${settings.profile} workflow for approval…`, "info");
  await pi.sendMessage(
    { customType: "workflow-run", content: forcedPrompt, display: true },
    { triggerTurn: true, deliverAs: "followUp" },
  );
}

async function runSavedWorkflow(
  manager: WorkflowManager,
  cwd: string,
  name: string | undefined,
  rawArgs: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!name) return ctx.ui.notify("Usage: /workflow saved <name> [json args]", "warning");
  requireTrustedProject(ctx);
  const settings = requireConfiguredSettings(cwd);
  assertConfiguredModels(settings, toModelCandidates(ctx.modelRegistry.getAvailable()));
  const workflow = loadWorkflowFile(cwd, name);
  if (!workflow) return ctx.ui.notify(`No saved workflow "${name}".`, "error");

  let args: unknown;
  if (rawArgs) {
    try {
      args = JSON.parse(rawArgs);
    } catch {
      return ctx.ui.notify("Saved workflow arguments must be valid JSON.", "error");
    }
  }

  saveModelTierConfig(toModelTierConfig(settings));
  const preview = createWorkflowPreview(workflow.script, settings, "saved");
  await requireWorkflowApproval(ctx, preview, settings.approvalMode === "always");
  const { runId, promise } = manager.startInBackground(workflow.script, args, {
    concurrency: settings.concurrency,
    maxAgents: settings.maxAgents,
    confirm: ctx.hasUI
      ? (question) => ctx.ui.input("Workflow checkpoint", String(question))
      : undefined,
  });
  void promise.catch(() => {});
  ctx.ui.notify(`Started ${workflow.name} in the background (${runId}).`, "info");
}

async function setupWorkflow(
  cwd: string,
  ctx: ExtensionCommandContext,
  requestedProfile?: WorkflowProfileName,
): Promise<WorkflowControlSettings | undefined> {
  if (!ctx.hasUI) {
    ctx.ui.notify("Workflow setup requires interactive mode.", "error");
    return undefined;
  }
  const currentModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
  const available = [...ctx.modelRegistry.getAvailable()];
  if (ctx.model && !available.some((model) => `${model.provider}/${model.id}` === currentModel)) {
    available.unshift(ctx.model);
  }
  const configuredScope = SettingsManager.create(cwd, undefined, {
    projectTrusted: ctx.isProjectTrusted(),
  }).getEnabledModels();
  const candidates = scopeModelCandidates(toModelCandidates(available), configuredScope, currentModel);
  if (!candidates.length && !currentModel) {
    ctx.ui.notify("No authenticated models are available.", "error");
    return undefined;
  }

  const profile = requestedProfile ?? (await chooseProfile(ctx));
  if (!profile) return undefined;
  const baseProfile = profile === "custom" ? "balanced" : profile;
  let settings = suggestWorkflowSettings(baseProfile, candidates, currentModel);
  if (profile === "custom") settings = { ...settings, profile: "custom" };

  if (profile !== "custom") {
    const routing = await ctx.ui.select("Model routing", [
      "Use suggested role routing (recommended)",
      "Customize models and effort",
    ]);
    if (!routing) return undefined;
    if (routing === "Customize models and effort") {
      const customized = await customizeRoutes(settings, candidates, ctx);
      if (!customized) return undefined;
      settings = customized;
    }
  } else {
    const customized = await customizeRoutes(settings, candidates, ctx, true);
    if (!customized) return undefined;
    settings = customized;
  }

  if (profile === "custom") {
    const concurrency = await askInteger(ctx, "Maximum concurrent agents", settings.concurrency, 1, 16);
    if (concurrency === undefined) return undefined;
    const maxAgents = await askInteger(ctx, "Maximum agents per workflow", settings.maxAgents, 1, 1000);
    if (maxAgents === undefined) return undefined;
    settings = { ...settings, concurrency, maxAgents };
  } else {
    const limits = profileLimits(profile);
    settings = { ...settings, concurrency: limits.concurrency, maxAgents: limits.maxAgents };
  }

  const approval = await ctx.ui.select("Approval policy", [
    "Review every workflow (recommended)",
    "Review generated workflows; trust saved files",
  ]);
  if (!approval) return undefined;
  const approvalMode: WorkflowApprovalMode = approval.startsWith("Review every") ? "always" : "generated";
  settings = { ...settings, approvalMode };

  const scopeChoice = await ctx.ui.select("Save settings", [
    "All projects (recommended)",
    "This project only",
  ]);
  if (!scopeChoice) return undefined;
  const scope = scopeChoice.startsWith("All") ? "global" : "project";
  const approved = await ctx.ui.confirm("Save workflow setup?", formatSettings(settings));
  if (!approved) return undefined;

  const path = saveWorkflowControlSettings(settings, cwd, scope);
  saveModelTierConfig(toModelTierConfig(settings));
  ctx.ui.notify(`Saved ${settings.profile} workflow profile to ${path}.`, "info");
  return settings;
}

async function chooseProfile(ctx: ExtensionCommandContext): Promise<WorkflowProfileName | undefined> {
  const labels = WORKFLOW_PROFILE_NAMES.map((profile) => PROFILE_LABELS[profile]);
  const selected = await ctx.ui.select("Workflow profile", labels);
  return WORKFLOW_PROFILE_NAMES[labels.indexOf(selected ?? "")];
}

async function customizeRoutes(
  settings: WorkflowControlSettings,
  candidates: WorkflowModelCandidate[],
  ctx: ExtensionCommandContext,
  customizeLimits = false,
): Promise<WorkflowControlSettings | undefined> {
  const routes = { ...settings.routes };

  for (const role of WORKFLOW_ROLES) {
    const current = settings.routes[role];
    const selectedModel = await selectWorkflowModel(ctx, `${capitalize(role)} model`, candidates, current.model);
    if (!selectedModel) return undefined;
    const thinkingLabels = WORKFLOW_THINKING_LEVELS.map((level) =>
      level === current.thinking ? `${level} (current)` : level,
    );
    const selectedThinking = await ctx.ui.select(`${capitalize(role)} effort`, thinkingLabels);
    if (!selectedThinking) return undefined;
    routes[role] = {
      model: selectedModel,
      thinking: selectedThinking.replace(" (current)", "") as WorkflowThinkingLevel,
    };
  }

  return { ...settings, profile: customizeLimits ? "custom" : settings.profile, routes };
}

async function selectWorkflowModel(
  ctx: ExtensionCommandContext,
  title: string,
  candidates: readonly WorkflowModelCandidate[],
  currentSpec: string,
): Promise<string | undefined> {
  if (ctx.mode !== "tui") {
    const labels = candidates.map((model) => `${model.spec} — ${model.name}`);
    const selected = await ctx.ui.select(title, labels);
    const index = labels.indexOf(selected ?? "");
    return candidates[index]?.spec;
  }
  return ctx.ui.custom<string | undefined>(
    (tui, theme, _keybindings, done) =>
      new WorkflowModelSelector(
        tui,
        theme,
        title,
        candidates,
        currentSpec,
        (model) => done(model.spec),
        () => done(undefined),
      ),
  );
}

async function requireWorkflowApproval(
  ctx: ExtensionContext,
  preview: ReturnType<typeof createWorkflowPreview>,
  required: boolean,
): Promise<void> {
  if (!required) return;
  if (!ctx.hasUI) {
    throw new Error("This workflow requires interactive approval. Run it from Pi's TUI or RPC mode.");
  }
  const approved = await requestWorkflowApproval(ctx, preview);
  if (!approved) throw new Error("Workflow cancelled by the user before execution.");
}

function requireTrustedProject(ctx: ExtensionContext): void {
  if (!ctx.isProjectTrusted()) {
    throw new Error("Workflow execution is disabled because this project is not trusted.");
  }
}

function requireConfiguredSettings(cwd: string): WorkflowControlSettings {
  const settings = loadWorkflowControlSettings(cwd);
  if (!settings) throw new Error("Workflow model roles are not configured. Run /workflow setup first.");
  return settings;
}

function assertConfiguredModels(settings: WorkflowControlSettings, candidates: WorkflowModelCandidate[]): void {
  if (!candidates.length) return;
  const available = new Set(candidates.map((model) => model.spec));
  const missing = WORKFLOW_ROLES.filter((role) => !available.has(settings.routes[role].model));
  if (missing.length) {
    throw new Error(`Workflow model routes are unavailable for ${missing.join(", ")}. Run /workflow setup again.`);
  }
}

async function showSavedWorkflows(pi: ExtensionAPI, cwd: string): Promise<void> {
  const workflows = discoverWorkflowFiles(cwd);
  if (!workflows.length) {
    await print(pi, "No saved workflows. Add project files under .pi/workflows/*.js or personal files under ~/.pi/workflows/saved/*.js.");
    return;
  }
  await print(pi, ["Saved workflows:", ...workflows.map((workflow) => `  ${workflowLabel(workflow)}\n    ${workflow.path}`)].join("\n"));
}

async function showRuns(pi: ExtensionAPI, manager: WorkflowManager, activeOnly: boolean): Promise<void> {
  const runs = manager
    .listAllRuns()
    .filter((run) => !activeOnly || run.status === "running" || run.status === "paused");
  if (!runs.length) {
    await print(pi, activeOnly ? "No active workflows." : "No workflow history yet.");
    return;
  }
  await print(
    pi,
    [
      activeOnly ? "Active workflows:" : "Workflow history:",
      ...runs.map((run) => {
        const done = run.agents.filter((agent) => agent.status === "done").length;
        return `  ${run.runId}  ${run.workflowName}  ${run.status}  ${done}/${run.agents.length} agents`;
      }),
    ].join("\n"),
  );
}

async function showRunStatus(pi: ExtensionAPI, manager: WorkflowManager, id?: string): Promise<void> {
  if (!id) return print(pi, "Usage: /workflow status <runId>");
  const run = manager.listAllRuns().find((candidate) => candidate.runId === id);
  if (!run) return print(pi, `No workflow run "${id}".`);
  const lines = [
    `${run.workflowName} (${run.runId}) — ${run.status}`,
    run.snapshot.currentPhase ? `Phase: ${run.snapshot.currentPhase}` : "",
    ...run.agents.map(
      (agent) => `  ${agent.status.padEnd(7)} ${agent.label}${agent.cached ? " (cached)" : ""}`,
    ),
  ].filter(Boolean);
  await print(pi, lines.join("\n"));
}

async function showSettings(pi: ExtensionAPI, cwd: string): Promise<void> {
  const settings = loadWorkflowControlSettings(cwd);
  await print(pi, settings ? formatSettings(settings) : "Workflow is not configured. Run /workflow setup.");
}

async function showDoctor(
  pi: ExtensionAPI,
  manager: WorkflowManager,
  cwd: string,
  toolName: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const settings = loadWorkflowControlSettings(cwd);
  let candidates: WorkflowModelCandidate[] = [];
  try {
    candidates = toModelCandidates(ctx.modelRegistry.getAvailable());
  } catch {
    // The report remains useful when a provider cannot enumerate its catalog.
  }
  const available = new Set(candidates.map((candidate) => candidate.spec));
  const missingRoles = settings
    ? WORKFLOW_ROLES.filter((role) => !available.has(settings.routes[role].model))
    : [];
  await print(pi, formatWorkflowDoctor({
    extensionActive: pi.getActiveTools().includes(toolName),
    projectTrusted: ctx.isProjectTrusted(),
    settings,
    availableModels: candidates.length,
    missingRoles,
    savedWorkflows: discoverWorkflowFiles(cwd).length,
    runHistory: manager.listAllRuns().length,
  }));
}

function formatSettings(settings: WorkflowControlSettings): string {
  return [
    `Profile: ${settings.profile}`,
    `Scale: ${settings.maxAgents} agents, ${settings.concurrency} concurrent`,
    `Approval: ${settings.approvalMode === "always" ? "every workflow" : "generated workflows"}`,
    ...WORKFLOW_ROLES.map((role) => `${capitalize(role)}: ${routeSpec(settings.routes[role])}`),
  ].join("\n");
}

function notifyControl(
  ctx: ExtensionCommandContext,
  id: string | undefined,
  action: string,
  operation: (runId: string) => boolean,
): void {
  if (!id) return ctx.ui.notify(`Usage: /workflow ${action} <runId>`, "warning");
  const changed = operation(id);
  ctx.ui.notify(changed ? `${capitalize(action)}d ${id}.` : `Cannot ${action} ${id}.`, changed ? "info" : "warning");
}

async function resumeRun(manager: WorkflowManager, id: string | undefined, ctx: ExtensionCommandContext): Promise<void> {
  if (!id) return ctx.ui.notify("Usage: /workflow resume <runId>", "warning");
  const resumed = await manager.resume(id);
  ctx.ui.notify(resumed ? `Resumed ${id}.` : `Cannot resume ${id}.`, resumed ? "info" : "warning");
}

async function askInteger(
  ctx: ExtensionCommandContext,
  title: string,
  current: number,
  min: number,
  max: number,
): Promise<number | undefined> {
  const value = await ctx.ui.input(title, String(current));
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    ctx.ui.notify(`Enter a whole number from ${min} to ${max}.`, "error");
    return undefined;
  }
  return parsed;
}

function normalizeProfile(value: string | undefined): WorkflowProfileName | undefined {
  return value && WORKFLOW_PROFILE_NAMES.includes(value as WorkflowProfileName)
    ? (value as WorkflowProfileName)
    : undefined;
}

function workflowLabel(workflow: SavedWorkflowFile): string {
  return `${workflow.id} — ${workflow.description} [${workflow.location}]`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function print(pi: ExtensionAPI, content: string): Promise<void> {
  return Promise.resolve(pi.sendMessage({ customType: "workflow", content, display: true })).then(() => {});
}
