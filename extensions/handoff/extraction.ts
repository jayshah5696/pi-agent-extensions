import type { ExtractionOutput, HandoffConfig, ParseResult } from "./types.js";
import { parseExtractionResponse, normalizeExtraction } from "./parser.js";

/**
 * System prompt for the extraction LLM call.
 * Instructs the model to extract structured context from the conversation.
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are a context extraction assistant. Your task is to analyze a conversation and extract the most relevant context for continuing work in a new thread.

Given the conversation history and the user's goal for the next thread, extract:
1. **relevantFiles**: Files that were ACTUALLY MENTIONED in the conversation that are relevant to the goal. Include a brief reason for each.
2. **relevantCommands**: Commands that were run and may need to be run again
3. **relevantInformation**: Key context for accomplishing the goal
4. **decisions**: Important decisions made during the conversation
5. **openQuestions**: Unresolved questions, risks, or blockers

## Output Format

Respond with ONLY a valid JSON object in this exact format:

\`\`\`json
{
  "relevantFiles": [
    { "path": "path/to/file.ts", "reason": "Brief reason why this file matters" }
  ],
  "relevantCommands": ["npm test", "git status"],
  "relevantInformation": [
    "Key fact or context point",
    "Another important detail"
  ],
  "decisions": [
    "Decision that was made and why"
  ],
  "openQuestions": [
    "Question that remains unanswered"
  ]
}
\`\`\`

## What to Extract

**relevantInformation** - Focus on:
- Project conventions learned (e.g., "Use TypeBox, not Zod for schemas")
- Runtime behaviors discovered (e.g., "Extensions hot-reload with /reload")
- Gotchas that could trip up the next agent (e.g., "Must use .js extension in imports")
- Technical constraints or requirements
- Key findings from exploration

**relevantFiles** - Only include files that:
- Were EXPLICITLY MENTIONED in the conversation (by path or filename)
- Are directly related to accomplishing the goal
- Contain patterns to follow or will need to be modified

## What NOT to Extract

- Completed tasks or work history ("We implemented X, then Y, then Z")
- Obvious actions the agent will do anyway (running tests, building, linting)
- Generic observations that don't help the specific goal
- Files that were NOT mentioned in the conversation (do not invent paths)

## Guidelines

- Be GOAL-FOCUSED: extract what helps accomplish the user's stated goal
- Be FUTURE-ORIENTED: what does the NEXT agent need to know?
- Be CONCISE: one line per entry, no fluff
- ONLY include files that were actually discussed - never invent file paths
- If a category has no relevant items, use an empty array
- Do NOT include any text outside the JSON block
- Do NOT explain your reasoning - just output the JSON`;

/**
 * Stricter prompt for retry after parse failure
 */
export const EXTRACTION_RETRY_PROMPT = `Your previous response was not valid JSON. Please output ONLY a valid JSON object with this structure:

{
  "relevantFiles": [{ "path": "string", "reason": "string" }],
  "relevantCommands": ["string"],
  "relevantInformation": ["string"],
  "decisions": ["string"],
  "openQuestions": ["string"]
}

No explanations, no markdown, no text before or after - ONLY the JSON object.`;

/**
 * Builds the user message for the extraction call
 */
export function buildExtractionUserMessage(
  conversationText: string,
  goal: string,
): string {
  return `## Conversation History

${conversationText}

## User's Goal for New Thread

${goal}

Extract the relevant context for this goal and output ONLY the JSON object.`;
}

/**
 * Result of an extraction attempt
 */
export interface ExtractionResult {
  success: boolean;
  extraction?: ExtractionOutput;
  error?: string;
  retried?: boolean;
}

/**
 * Processes the LLM response and handles retry logic.
 *
 * @param responseText - The text response from the LLM
 * @param config - Handoff configuration for normalization
 * @param conversationText - Optional conversation text for file validation
 * @returns Extraction result with normalized data or error
 */
export function processExtractionResponse(
  responseText: string,
  config: HandoffConfig,
  conversationText?: string,
): ParseResult & { normalized?: ExtractionOutput } {
  const parseResult = parseExtractionResponse(responseText);

  if (!parseResult.success || !parseResult.data) {
    return parseResult;
  }

  // Normalize the extraction (dedupe, cap limits, strip @ prefixes, validate files)
  const normalized = normalizeExtraction(parseResult.data, config, conversationText);

  return {
    success: true,
    data: parseResult.data,
    normalized,
  };
}

/**
 * Extracts text content from an assistant message
 */
export function extractTextFromAssistantMessage(
  content: Array<{ type: string; text?: string }>,
): string {
  return content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}
