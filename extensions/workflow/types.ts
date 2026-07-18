export const WORKFLOW_PROFILE_NAMES = ["lean", "balanced", "deep", "custom"] as const;
export type WorkflowProfileName = (typeof WORKFLOW_PROFILE_NAMES)[number];

export const WORKFLOW_ROLES = ["scout", "worker", "reviewer", "synthesizer"] as const;
export type WorkflowRole = (typeof WORKFLOW_ROLES)[number];

export const WORKFLOW_THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type WorkflowThinkingLevel = (typeof WORKFLOW_THINKING_LEVELS)[number];

export type WorkflowApprovalMode = "always" | "generated";

export interface WorkflowRoleRoute {
  model: string;
  thinking: WorkflowThinkingLevel;
}

export interface WorkflowControlSettings {
  version: 1;
  profile: WorkflowProfileName;
  routes: Record<WorkflowRole, WorkflowRoleRoute>;
  concurrency: number;
  maxAgents: number;
  approvalMode: WorkflowApprovalMode;
}

export interface WorkflowModelCandidate {
  spec: string;
  provider: string;
  name: string;
  costOutput: number;
  contextWindow: number;
}

export interface SavedWorkflowFile {
  id: string;
  name: string;
  description: string;
  phases: string[];
  path: string;
  location: "project" | "user" | "built-in";
  script: string;
}

export interface WorkflowPreview {
  name: string;
  description: string;
  phases: string[];
  staticAgentCalls: number;
  explicitModels: string[];
  explicitTools: string[];
  profile: WorkflowProfileName;
  routes: Record<WorkflowRole, WorkflowRoleRoute>;
  concurrency: number;
  maxAgents: number;
  source: "generated" | "saved";
}
