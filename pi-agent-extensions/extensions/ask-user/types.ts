import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

/**
 * Question schema - flexible structure supporting text input and options
 */
export const QuestionSchema = Type.Object({
  question: Type.String({ description: "The question to ask", minLength: 1 }),
  header: Type.Optional(Type.String({ description: "Optional header/title for context", minLength: 1 })),
  options: Type.Optional(
    Type.Array(
      Type.Object({
        label: Type.String({ description: "Display text", minLength: 1 }),
        description: Type.Optional(Type.String({ description: "Help text" })),
      }),
      { description: "Suggested options" },
    ),
  ),
  multiSelect: Type.Optional(Type.Boolean({ description: "Allow multiple selections" })),
});

export type Question = Static<typeof QuestionSchema>;

/**
 * Tool parameters
 */
export const AskUserParams = Type.Object({
  questions: Type.Array(QuestionSchema, {
    description: "One or more questions to ask the user",
    minItems: 1,
  }),
  metadata: Type.Optional(
    Type.Object(
      {},
      {
        additionalProperties: true,
        description: "Optional metadata for tracking (e.g., { source: 'setup-wizard' })",
      },
    ),
  ),
});

export type AskUserParams = Static<typeof AskUserParams>;

/**
 * Answer for a single question
 */
export interface Answer {
  question: string; // Echo of the question asked
  answer: string | string[]; // User's answer (string[] if multiSelect)
  selectedOption?: string; // Which option label was selected (if applicable)
  wasCustom: boolean; // True if user typed custom answer via "Other"
}

/**
 * Tool result
 */
export interface AskUserResult {
  answered: boolean; // false if cancelled
  answers: Answer[]; // Array matching questions order
  pendingFile?: string; // Path to JSON file (non-interactive mode only)
  cancelled?: boolean; // True if user cancelled
}

/**
 * Session details stored in tool result
 */
export interface AskUserDetails {
  questions: Question[];
  answers: Answer[];
  answeredAt: number; // timestamp
  mode: "interactive" | "print" | "rpc";
  metadata?: Record<string, unknown>;
}
