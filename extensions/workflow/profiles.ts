import type { Model } from "@earendil-works/pi-ai";
import { profileLimits } from "./config.js";
import type { ModelTierConfig } from "./runtime.js";
import {
  WORKFLOW_ROLES,
  type WorkflowControlSettings,
  type WorkflowModelCandidate,
  type WorkflowProfileName,
  type WorkflowRole,
  type WorkflowRoleRoute,
  type WorkflowThinkingLevel,
} from "./types.js";

export function toModelCandidates(models: readonly Model<any>[]): WorkflowModelCandidate[] {
  return models.map((model) => ({
    spec: `${model.provider}/${model.id}`,
    provider: model.provider,
    name: model.name,
    costOutput: model.cost?.output ?? 0,
    contextWindow: model.contextWindow ?? 0,
  }));
}

export function scopeModelCandidates(
  models: readonly WorkflowModelCandidate[],
  patterns: readonly string[] | undefined,
  currentModelSpec?: string,
): WorkflowModelCandidate[] {
  const unique = new Map(models.map((model) => [model.spec, model]));
  if (!patterns?.length) return [...unique.values()];

  const scoped: WorkflowModelCandidate[] = [];
  const seen = new Set<string>();
  for (const rawPattern of patterns) {
    const pattern = stripThinkingSuffix(rawPattern.trim());
    const candidates = [...unique.values()];
    const exact = candidates.filter((model) => exactModelPattern(model, pattern));
    const matches = exact.length
      ? exact
      : pattern.includes("*")
        ? candidates.filter((model) => matchesWildcardPattern(model, pattern))
        : candidates.filter((model) => matchesFuzzyPattern(model, pattern)).slice(0, 1);
    for (const model of matches) {
      if (seen.has(model.spec)) continue;
      scoped.push(model);
      seen.add(model.spec);
    }
  }
  if (currentModelSpec && unique.has(currentModelSpec) && !seen.has(currentModelSpec)) {
    scoped.unshift(unique.get(currentModelSpec)!);
  }
  return scoped.length ? scoped : [...unique.values()];
}

export function suggestWorkflowSettings(
  profile: Exclude<WorkflowProfileName, "custom">,
  models: readonly WorkflowModelCandidate[],
  currentModelSpec?: string,
): WorkflowControlSettings {
  if (!models.length && !currentModelSpec) {
    throw new Error("No authenticated models are available for workflow setup.");
  }

  const ranked = rankModels(models);
  const fallback = currentModelSpec ?? ranked[ranked.length - 1]?.spec;
  if (!fallback) throw new Error("No model is available for workflow setup.");

  const smallest = ranked[0]?.spec ?? fallback;
  const strongest = ranked[ranked.length - 1]?.spec ?? fallback;
  const middle = ranked[Math.floor(ranked.length / 2)]?.spec ?? fallback;
  const worker = profile === "lean" ? middle : profile === "deep" ? strongest : currentModelSpec ?? middle;
  const reviewer = differentProviderModel(ranked, worker)?.spec ?? strongest;
  const limits = profileLimits(profile);

  const routes: Record<WorkflowRole, WorkflowRoleRoute> = {
    scout: route(smallest, profile === "deep" ? "medium" : "low"),
    worker: route(worker, profile === "lean" ? "low" : profile === "deep" ? "high" : "medium"),
    reviewer: route(reviewer, profile === "deep" ? "xhigh" : profile === "lean" ? "medium" : "high"),
    synthesizer: route(strongest, profile === "deep" ? "max" : "high"),
  };

  return {
    version: 1,
    profile,
    routes,
    concurrency: limits.concurrency,
    maxAgents: limits.maxAgents,
    approvalMode: "always",
  };
}

export function rankModels(models: readonly WorkflowModelCandidate[]): WorkflowModelCandidate[] {
  const priced = models.filter((model) => model.costOutput > 0).map((model) => model.costOutput);
  const min = priced.length ? Math.min(...priced) : 0;
  const max = priced.length ? Math.max(...priced) : 0;
  const midpoint = priced.length ? (min + max) / 2 : 0;

  return models
    .map((model, index) => ({ model, index, score: modelScore(model, min, max, midpoint) }))
    .sort((a, b) => a.score - b.score || a.model.contextWindow - b.model.contextWindow || a.index - b.index)
    .map(({ model }) => model);
}

function modelScore(model: WorkflowModelCandidate, min: number, max: number, midpoint: number): number {
  if (model.costOutput > 0) return model.costOutput;
  const value = `${model.spec} ${model.name}`.toLowerCase();
  if (/mini|flash|haiku|nano|small/.test(value)) return min;
  if (/opus|pro|ultra|large|plus/.test(value)) return max;
  return midpoint;
}

function differentProviderModel(
  ranked: readonly WorkflowModelCandidate[],
  workerSpec: string,
): WorkflowModelCandidate | undefined {
  const workerProvider = workerSpec.split("/", 1)[0];
  return [...ranked].reverse().find((model) => model.provider !== workerProvider);
}

function route(model: string, thinking: WorkflowThinkingLevel): WorkflowRoleRoute {
  return { model, thinking };
}

function stripThinkingSuffix(pattern: string): string {
  const match = pattern.match(/:(off|minimal|low|medium|high|xhigh|max)$/i);
  return match ? pattern.slice(0, -match[0].length) : pattern;
}

function exactModelPattern(model: WorkflowModelCandidate, rawPattern: string): boolean {
  const pattern = rawPattern.toLowerCase();
  const spec = model.spec.toLowerCase();
  const id = spec.slice(spec.indexOf("/") + 1);
  return pattern === spec || pattern === id;
}

function matchesWildcardPattern(model: WorkflowModelCandidate, rawPattern: string): boolean {
  const source = rawPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  const wildcard = new RegExp(`^${source}$`, "i");
  const spec = model.spec.toLowerCase();
  const id = spec.slice(spec.indexOf("/") + 1);
  return wildcard.test(spec) || wildcard.test(id);
}

function matchesFuzzyPattern(model: WorkflowModelCandidate, rawPattern: string): boolean {
  const pattern = rawPattern.toLowerCase();
  const spec = model.spec.toLowerCase();
  const search = `${spec} ${model.name}`.toLowerCase();
  return search.includes(pattern);
}

export function routeSpec(route: WorkflowRoleRoute): string {
  return `${route.model}:${route.thinking}`;
}

export function toModelTierConfig(settings: WorkflowControlSettings): ModelTierConfig {
  const tiers: Record<string, string> = {};
  for (const role of WORKFLOW_ROLES) tiers[role] = routeSpec(settings.routes[role]);
  // Compatibility aliases for upstream-generated and older saved workflows.
  tiers.small = tiers.scout;
  tiers.medium = tiers.worker;
  tiers.big = tiers.synthesizer;
  return { tiers };
}

export function workflowRoleGuideline(settings: WorkflowControlSettings): string {
  const routes = WORKFLOW_ROLES.map(
    (role) => `${role}=${routeSpec(settings.routes[role])}`,
  ).join(", ");
  return [
    `This installation uses the ${settings.profile} workflow profile (${routes}).`,
    "Tag every agent with one of these semantic tiers: scout for cheap discovery, worker for implementation/analysis, reviewer for independent criticism, synthesizer for final integration.",
    "Use the literal role in opts.tier, for example { tier: 'scout' } or { tier: 'reviewer' }; small/medium/big remain compatibility aliases only.",
    `Keep the generated workflow within ${settings.maxAgents} total agents and ${settings.concurrency} concurrent agents.`,
  ].join(" ");
}
