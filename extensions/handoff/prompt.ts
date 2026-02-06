import type {
  ExtractionOutput,
  SessionMetadata,
  HandoffConfig,
} from "./types.js";

/**
 * Handoff preamble text that sets context for the new thread
 */
const HANDOFF_PREAMBLE = `# Handoff Context
You are continuing work from a previous thread. Use the context below and focus only on the goal at the bottom. Do not mention the handoff itself.
`;

/**
 * Assembles the final handoff prompt from extracted data, metadata, and user goal.
 *
 * Structure:
 * 1. Skill prefix (if enabled and present)
 * 2. Handoff preamble (if enabled)
 * 3. Context / relevant information
 * 4. Key decisions
 * 5. Open questions / risks
 * 6. Relevant files
 * 7. Relevant commands
 * 8. Session metadata (if enabled)
 * 9. Next goal (verbatim, always last)
 */
export function assembleHandoffPrompt(
  extraction: ExtractionOutput,
  goal: string,
  metadata: SessionMetadata | undefined,
  config: HandoffConfig,
): string {
  const sections: string[] = [];

  // 1. Skill prefix (at the very top, before preamble)
  if (config.includeSkill && metadata?.lastSkill) {
    sections.push(`/skill:${metadata.lastSkill}\n`);
  }

  // 2. Handoff preamble
  if (config.includeHandoffPreamble) {
    sections.push(HANDOFF_PREAMBLE);
  }

  // 3. Context / relevant information
  if (extraction.relevantInformation.length > 0) {
    const bullets = extraction.relevantInformation
      .map((info) => `- ${info}`)
      .join("\n");
    sections.push(`## Context (from previous thread)\n${bullets}\n`);
  }

  // 4. Key decisions
  if (extraction.decisions.length > 0) {
    const bullets = extraction.decisions
      .map((decision) => `- ${decision}`)
      .join("\n");
    sections.push(`## Key Decisions\n${bullets}\n`);
  }

  // 5. Open questions / risks
  if (extraction.openQuestions.length > 0) {
    const bullets = extraction.openQuestions
      .map((question) => `- ${question}`)
      .join("\n");
    sections.push(`## Open Questions / Risks\n${bullets}\n`);
  }

  // 6. Relevant files
  if (extraction.relevantFiles.length > 0) {
    let fileLines: string[];
    if (config.includeFileReasons) {
      fileLines = extraction.relevantFiles.map(
        (file) => `- ${file.path} - ${file.reason}`,
      );
    } else {
      fileLines = extraction.relevantFiles.map((file) => `- ${file.path}`);
    }
    sections.push(`## Relevant Files\n${fileLines.join("\n")}\n`);
  }

  // 7. Relevant commands
  if (extraction.relevantCommands.length > 0) {
    const bullets = extraction.relevantCommands
      .map((cmd) => `- ${cmd}`)
      .join("\n");
    sections.push(`## Relevant Commands\n${bullets}\n`);
  }

  // 8. Session metadata
  if (config.includeMetadata && metadata && hasRelevantMetadata(metadata)) {
    const metadataLines: string[] = [];

    if (metadata.model) {
      let modelLine = `- Model: ${metadata.model}`;
      if (metadata.thinkingLevel) {
        modelLine += ` (thinking: ${metadata.thinkingLevel})`;
      }
      metadataLines.push(modelLine);
    }

    if (metadata.tools && metadata.tools.length > 0) {
      metadataLines.push(`- Tools: ${metadata.tools.join(", ")}`);
    }

    if (metadata.git && metadata.git.branch) {
      const dirtyFlag = metadata.git.isDirty ? " (dirty)" : "";
      metadataLines.push(`- Git: ${metadata.git.branch}${dirtyFlag}`);
    }

    // Only show prior skill in metadata if includeSkill is enabled
    if (config.includeSkill && metadata.lastSkill) {
      metadataLines.push(`- Prior skill: /skill:${metadata.lastSkill}`);
    }

    if (metadataLines.length > 0) {
      sections.push(`## Session Metadata\n${metadataLines.join("\n")}\n`);
    }
  }

  // 9. Next goal (always last, verbatim)
  sections.push(`## Next Goal (verbatim)\n${goal}\n`);

  return sections.join("\n");
}

/**
 * Checks if metadata has any relevant content worth including
 */
function hasRelevantMetadata(metadata: SessionMetadata): boolean {
  return !!(
    metadata.model ||
    metadata.thinkingLevel ||
    (metadata.tools && metadata.tools.length > 0) ||
    (metadata.git && metadata.git.branch) ||
    metadata.lastSkill
  );
}
