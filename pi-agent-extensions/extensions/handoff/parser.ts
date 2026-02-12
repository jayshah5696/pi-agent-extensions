import { Value } from "@sinclair/typebox/value";
import {
  ExtractionOutputSchema,
  type ExtractionOutput,
  type HandoffConfig,
  type ParseResult,
  type RelevantFile,
} from "./types.js";

/**
 * Attempts to extract JSON from text that may contain markdown code blocks
 * or other surrounding content.
 */
export function extractJsonFromText(text: string): unknown | null {
  // Try to extract from markdown code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Fall through to try other methods
    }
  }

  // Try to find JSON object directly (starts with { and ends with })
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Fall through
    }
  }

  // Try parsing the whole text as JSON
  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

/**
 * Parses the LLM response and validates it against the extraction schema.
 */
export function parseExtractionResponse(text: string): ParseResult {
  const parsed = extractJsonFromText(text);

  if (parsed === null) {
    return {
      success: false,
      error: "Could not extract valid JSON from response",
    };
  }

  // Validate against schema
  if (!Value.Check(ExtractionOutputSchema, parsed)) {
    const errors = [...Value.Errors(ExtractionOutputSchema, parsed)];
    const errorMessages = errors
      .slice(0, 3)
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    return {
      success: false,
      error: `Schema validation failed: ${errorMessages}`,
    };
  }

  return {
    success: true,
    data: parsed as ExtractionOutput,
  };
}

/**
 * Validates that extracted files were actually mentioned in the conversation.
 * Filters out hallucinated file paths that the LLM invented.
 *
 * @param files - The files extracted by the LLM
 * @param conversationText - The full conversation text to check against
 * @returns Files that were actually mentioned in the conversation
 */
export function validateFilesAgainstConversation(
  files: RelevantFile[],
  conversationText: string,
): RelevantFile[] {
  const lowerConversation = conversationText.toLowerCase();

  return files.filter((file) => {
    const path = file.path.toLowerCase();

    // Check if the full path appears in the conversation
    if (lowerConversation.includes(path)) {
      return true;
    }

    // Check if just the filename appears (handles cases where path is mentioned without full path)
    const filename = path.split("/").pop();
    if (filename && lowerConversation.includes(filename)) {
      return true;
    }

    // File was not mentioned - filter it out
    return false;
  });
}

/**
 * Normalizes the extraction output by:
 * - Deduplicating files and commands
 * - Capping arrays to configured maximums
 * - Stripping @ prefix from file paths
 * - Filtering empty entries
 * - Optionally validating files against conversation
 */
export function normalizeExtraction(
  extraction: ExtractionOutput,
  config: HandoffConfig,
  conversationText?: string,
): ExtractionOutput {
  // Normalize and dedupe files
  const seenPaths = new Set<string>();
  let normalizedFiles = extraction.relevantFiles
    .map((file) => ({
      path: file.path.replace(/^@/, ""), // Strip @ prefix
      reason: file.reason,
    }))
    .filter((file) => {
      if (seenPaths.has(file.path)) {
        return false;
      }
      seenPaths.add(file.path);
      return true;
    });

  // Validate files against conversation if enabled and text provided
  if (config.validateFiles && conversationText) {
    normalizedFiles = validateFilesAgainstConversation(
      normalizedFiles,
      conversationText,
    );
  }

  // Cap to max files
  normalizedFiles = normalizedFiles.slice(0, config.maxFiles);

  // Dedupe commands and filter empty
  const seenCommands = new Set<string>();
  const normalizedCommands = extraction.relevantCommands
    .filter((cmd) => cmd.trim().length > 0)
    .filter((cmd) => {
      if (seenCommands.has(cmd)) {
        return false;
      }
      seenCommands.add(cmd);
      return true;
    })
    .slice(0, config.maxCommands);

  // Filter empty entries from other arrays
  const normalizedInfo = extraction.relevantInformation
    .filter((item) => item.trim().length > 0)
    .slice(0, config.maxInformationItems);

  const normalizedDecisions = extraction.decisions
    .filter((item) => item.trim().length > 0)
    .slice(0, config.maxDecisionItems);

  const normalizedQuestions = extraction.openQuestions
    .filter((item) => item.trim().length > 0)
    .slice(0, config.maxOpenQuestions);

  return {
    relevantFiles: normalizedFiles,
    relevantCommands: normalizedCommands,
    relevantInformation: normalizedInfo,
    decisions: normalizedDecisions,
    openQuestions: normalizedQuestions,
  };
}
