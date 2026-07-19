import { WORKFLOW_ROLES, type WorkflowControlSettings, type WorkflowPreview } from "./types.js";
import { routeSpec } from "./profiles.js";
import { parseWorkflowScript, type WorkflowToolInput } from "./runtime.js";

export function createWorkflowPreview(
  script: string,
  settings: WorkflowControlSettings,
  source: "generated" | "saved",
  requested: Pick<WorkflowToolInput, "concurrency" | "maxAgents"> = {},
): WorkflowPreview {
  const { meta, body } = parseWorkflowScript(script);
  const executableAgentCalls = countStaticAgentCalls(body);
  if (!executableAgentCalls) {
    throw new Error("Workflow preflight failed: the executable workflow body does not call agent().");
  }
  return {
    name: meta.name,
    description: meta.description,
    script,
    phases: meta.phases?.map((phase) => phase.title) ?? [],
    staticAgentCalls: executableAgentCalls,
    explicitModels: collectStringOptions(script, "model"),
    explicitTools: collectTools(script),
    profile: settings.profile,
    routes: settings.routes,
    concurrency: clamp(requested.concurrency, settings.concurrency),
    maxAgents: clamp(requested.maxAgents, settings.maxAgents),
    source,
  };
}

export function applyWorkflowLimits(
  input: WorkflowToolInput,
  settings: WorkflowControlSettings,
): WorkflowToolInput {
  return {
    ...input,
    concurrency: clamp(input.concurrency, settings.concurrency),
    maxAgents: clamp(input.maxAgents, settings.maxAgents),
  };
}

export function formatWorkflowApproval(preview: WorkflowPreview): string {
  const lines = [
    `${preview.name} — ${preview.description}`,
    "",
    `Source: ${preview.source}`,
    `Profile: ${preview.profile}`,
    `Phases: ${preview.phases.length ? preview.phases.join(" → ") : "not declared"}`,
    `Scale cap: ${preview.maxAgents} agents, ${preview.concurrency} concurrent`,
    `Static agent() call sites: ${preview.staticAgentCalls || "dynamic/unknown"}`,
    "",
    "Model routes:",
    ...WORKFLOW_ROLES.map((role) => `  ${role}: ${routeSpec(preview.routes[role])}`),
    "",
    preview.explicitModels.length
      ? `Explicit model overrides: ${preview.explicitModels.join(", ")}`
      : "Explicit model overrides: none detected",
    preview.explicitTools.length
      ? `Explicit tool allowlists: ${preview.explicitTools.join(", ")}`
      : "Tools: default coding tools (repository writes are possible)",
    "",
    "Security: this trusted JavaScript runs in the upstream in-process VM. The VM is a determinism boundary, not a security sandbox.",
  ];
  return lines.join("\n");
}

function countStaticAgentCalls(script: string): number {
  return script.match(/\bagent\s*\(/g)?.length ?? 0;
}

function collectStringOptions(script: string, key: string): string[] {
  const values = new Set<string>();
  const pattern = new RegExp(`\\b${key}\\s*:\\s*(["'])(.*?)\\1`, "g");
  for (const match of script.matchAll(pattern)) {
    if (match[2]) values.add(match[2]);
  }
  return [...values];
}

function collectTools(script: string): string[] {
  const values = new Set<string>();
  const arrays = script.matchAll(/\btools\s*:\s*\[([^\]]*)\]/g);
  for (const array of arrays) {
    for (const match of array[1].matchAll(/(["'])(.*?)\1/g)) {
      if (match[2]) values.add(match[2]);
    }
  }
  return [...values];
}

function clamp(requested: number | undefined, configured: number): number {
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested < 1) return configured;
  return Math.min(Math.floor(requested), configured);
}
