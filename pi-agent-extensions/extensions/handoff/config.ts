import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG, type HandoffConfig } from "./types.js";

/**
 * Known valid config keys
 */
const VALID_CONFIG_KEYS: (keyof HandoffConfig)[] = [
  "maxFiles",
  "maxCommands",
  "maxInformationItems",
  "maxDecisionItems",
  "maxOpenQuestions",
  "minGoalLength",
  "includeMetadata",
  "includeSkill",
  "includeFileReasons",
  "includeHandoffPreamble",
  "useCurrentModel",
  "model",
  "showProgressPhases",
  "validateFiles",
];

/**
 * Merges user-provided config overrides with defaults.
 * Only known config keys are merged; unknown properties are ignored.
 */
export function mergeConfig(
  overrides: Partial<HandoffConfig> | undefined,
): HandoffConfig {
  if (!overrides) {
    return { ...DEFAULT_CONFIG };
  }

  const result: HandoffConfig = { ...DEFAULT_CONFIG };

  for (const key of VALID_CONFIG_KEYS) {
    if (key in overrides && overrides[key] !== undefined) {
      (result as any)[key] = overrides[key];
    }
  }

  return result;
}

/**
 * Vague goals that should be rejected
 */
const VAGUE_GOALS = new Set([
  "continue",
  "keep going",
  "more",
  "next",
  "proceed",
  "go on",
  "resume",
  "carry on",
]);

/**
 * Validation result for goal input
 */
export interface GoalValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validates the user's goal input.
 *
 * @param goal - The goal string to validate
 * @param minLength - Minimum required length (after trimming)
 * @returns Validation result with error message if invalid
 */
/**
 * Reads handoff config from .pi/settings.json in the given directory.
 * Returns undefined if file doesn't exist or has no handoff config.
 */
export function readSettingsFile(cwd: string): Partial<HandoffConfig> | undefined {
  const settingsPath = join(cwd, ".pi", "settings.json");
  
  if (!existsSync(settingsPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(content);
    
    if (settings && typeof settings.handoff === "object") {
      return settings.handoff as Partial<HandoffConfig>;
    }
    
    return undefined;
  } catch {
    // File exists but couldn't be parsed - ignore and use defaults
    return undefined;
  }
}

/**
 * Loads handoff config from .pi/settings.json merged with defaults.
 * 
 * @param cwd - Working directory to look for .pi/settings.json
 * @returns Merged configuration
 */
export function loadConfig(cwd: string): HandoffConfig {
  const overrides = readSettingsFile(cwd);
  return mergeConfig(overrides);
}

export function validateGoal(goal: string, minLength: number): GoalValidation {
  const trimmed = goal.trim();

  // Empty or whitespace-only
  if (trimmed.length === 0) {
    return {
      valid: false,
      error: "Goal is required. What should the next thread accomplish?",
    };
  }

  // Check for vague goals
  if (VAGUE_GOALS.has(trimmed.toLowerCase())) {
    return {
      valid: false,
      error: `"${trimmed}" is too vague. Be specific: what should the next thread accomplish? Example: "implement team-level handoff, update tests, document API."`,
    };
  }

  // Check minimum length
  if (trimmed.length < minLength) {
    return {
      valid: false,
      error: `Goal is too short (${trimmed.length} chars, minimum ${minLength}). Be more specific about what should be accomplished.`,
    };
  }

  return { valid: true };
}
