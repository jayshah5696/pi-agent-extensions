import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

/**
 * Schema for a relevant file entry from LLM extraction
 */
export const RelevantFileSchema = Type.Object({
  path: Type.String({ description: "File path relative to project root" }),
  reason: Type.String({ description: "Why this file is relevant to the handoff" }),
});

export type RelevantFile = Static<typeof RelevantFileSchema>;

/**
 * Schema for the LLM extraction output
 * This is what we expect the model to return as JSON
 */
export const ExtractionOutputSchema = Type.Object({
  relevantFiles: Type.Array(RelevantFileSchema, {
    description: "Files relevant to the next task",
  }),
  relevantCommands: Type.Array(Type.String(), {
    description: "Commands that were run or should be run",
  }),
  relevantInformation: Type.Array(Type.String(), {
    description: "Key context facts for the next thread",
  }),
  decisions: Type.Array(Type.String(), {
    description: "Important decisions made during the session",
  }),
  openQuestions: Type.Array(Type.String(), {
    description: "Unresolved questions or risks",
  }),
});

export type ExtractionOutput = Static<typeof ExtractionOutputSchema>;

/**
 * Git metadata collected from the repository
 */
export interface GitMetadata {
  branch: string | null;
  isDirty: boolean;
}

/**
 * Session metadata for handoff context
 */
export interface SessionMetadata {
  model?: string;
  thinkingLevel?: string;
  tools?: string[];
  sessionName?: string;
  git?: GitMetadata;
  lastSkill?: string;
}

/**
 * Configuration options for handoff behavior
 * Loaded from .pi/settings.json under "handoff" key
 */
export interface HandoffConfig {
  maxFiles: number;
  maxCommands: number;
  maxInformationItems: number;
  maxDecisionItems: number;
  maxOpenQuestions: number;
  minGoalLength: number;
  includeMetadata: boolean;
  includeSkill: boolean;
  includeFileReasons: boolean;
  includeHandoffPreamble: boolean;
  useCurrentModel: boolean;
  model?: string; // Override model for extraction (e.g., "anthropic/claude-3-haiku")
  showProgressPhases: boolean; // Show phase labels during extraction (default: true)
  validateFiles: boolean; // Filter out files not mentioned in conversation (default: true)
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: HandoffConfig = {
  maxFiles: 20,
  maxCommands: 10,
  maxInformationItems: 12,
  maxDecisionItems: 8,
  maxOpenQuestions: 6,
  minGoalLength: 12,
  includeMetadata: true,
  includeSkill: true,
  includeFileReasons: true,
  includeHandoffPreamble: true,
  useCurrentModel: true,
  showProgressPhases: true,
  validateFiles: true,
};

/**
 * Result of parsing LLM extraction response
 */
export interface ParseResult {
  success: boolean;
  data?: ExtractionOutput;
  error?: string;
}

/**
 * Custom entry type for persisting skill tracking
 */
export const SKILL_ENTRY_TYPE = "handoff:last-skill";

export interface SkillEntry {
  skillName: string;
  timestamp: number;
}
