import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  WORKFLOW_PROFILE_NAMES,
  WORKFLOW_ROLES,
  WORKFLOW_THINKING_LEVELS,
  type WorkflowApprovalMode,
  type WorkflowControlSettings,
  type WorkflowProfileName,
  type WorkflowRole,
  type WorkflowRoleRoute,
  type WorkflowThinkingLevel,
} from "./types.js";

const GLOBAL_SETTINGS_PATH = join(homedir(), ".pi", "workflows", "control-plane.json");
const PROJECT_SETTINGS_RELATIVE_PATH = join(".pi", "workflow.json");

export interface WorkflowSettingsPaths {
  globalPath?: string;
  projectPath?: string;
}

export function getWorkflowControlGlobalPath(): string {
  return GLOBAL_SETTINGS_PATH;
}

export function getWorkflowControlProjectPath(cwd: string): string {
  return join(cwd, PROJECT_SETTINGS_RELATIVE_PATH);
}

export function loadWorkflowControlSettings(
  cwd: string,
  paths: WorkflowSettingsPaths = {},
): WorkflowControlSettings | undefined {
  const global = readSettings(paths.globalPath ?? getWorkflowControlGlobalPath());
  const project = readSettings(paths.projectPath ?? getWorkflowControlProjectPath(cwd));
  return project ?? global;
}

export function saveWorkflowControlSettings(
  settings: WorkflowControlSettings,
  cwd: string,
  scope: "global" | "project",
  paths: WorkflowSettingsPaths = {},
): string {
  const path =
    scope === "project"
      ? (paths.projectPath ?? getWorkflowControlProjectPath(cwd))
      : (paths.globalPath ?? getWorkflowControlGlobalPath());
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalizeSettings(settings), null, 2)}\n`, "utf8");
  return path;
}

function readSettings(path: string): WorkflowControlSettings | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return normalizeSettings(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
}

function normalizeSettings(value: unknown): WorkflowControlSettings | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const profile = normalizeProfile(raw.profile);
  const routes = normalizeRoutes(raw.routes);
  if (!profile || !routes) return undefined;

  const limits = profileLimits(profile);
  return {
    version: 1,
    profile,
    routes,
    concurrency: normalizeInteger(raw.concurrency, 1, 16) ?? limits.concurrency,
    maxAgents: normalizeInteger(raw.maxAgents, 1, 1000) ?? limits.maxAgents,
    approvalMode: normalizeApprovalMode(raw.approvalMode) ?? "always",
  };
}

function normalizeProfile(value: unknown): WorkflowProfileName | undefined {
  return typeof value === "string" && WORKFLOW_PROFILE_NAMES.includes(value as WorkflowProfileName)
    ? (value as WorkflowProfileName)
    : undefined;
}

function normalizeApprovalMode(value: unknown): WorkflowApprovalMode | undefined {
  return value === "always" || value === "generated" ? value : undefined;
}

function normalizeRoutes(value: unknown): Record<WorkflowRole, WorkflowRoleRoute> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const routes = {} as Record<WorkflowRole, WorkflowRoleRoute>;
  for (const role of WORKFLOW_ROLES) {
    const route = raw[role];
    if (!route || typeof route !== "object" || Array.isArray(route)) return undefined;
    const candidate = route as Record<string, unknown>;
    if (typeof candidate.model !== "string" || !candidate.model.trim()) return undefined;
    if (
      typeof candidate.thinking !== "string" ||
      !WORKFLOW_THINKING_LEVELS.includes(candidate.thinking as WorkflowThinkingLevel)
    ) {
      return undefined;
    }
    routes[role] = {
      model: candidate.model.trim(),
      thinking: candidate.thinking as WorkflowThinkingLevel,
    };
  }
  return routes;
}

function normalizeInteger(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) return undefined;
  return Math.min(max, Math.floor(value));
}

export function profileLimits(profile: WorkflowProfileName): { concurrency: number; maxAgents: number } {
  switch (profile) {
    case "lean":
      return { concurrency: 3, maxAgents: 8 };
    case "balanced":
      return { concurrency: 4, maxAgents: 15 };
    case "deep":
      return { concurrency: 6, maxAgents: 40 };
    case "custom":
      return { concurrency: 4, maxAgents: 15 };
  }
}
