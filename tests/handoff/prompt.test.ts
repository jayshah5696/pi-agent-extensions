import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleHandoffPrompt } from "../../extensions/handoff/prompt.js";
import type {
  ExtractionOutput,
  SessionMetadata,
  HandoffConfig,
} from "../../extensions/handoff/types.js";
import { DEFAULT_CONFIG } from "../../extensions/handoff/types.js";

describe("assembleHandoffPrompt", () => {
  const minimalExtraction: ExtractionOutput = {
    relevantFiles: [],
    relevantCommands: [],
    relevantInformation: [],
    decisions: [],
    openQuestions: [],
  };

  const fullExtraction: ExtractionOutput = {
    relevantFiles: [
      { path: "src/index.ts", reason: "Main entry point" },
      { path: "src/utils.ts", reason: "Helper functions" },
    ],
    relevantCommands: ["npm test", "npm run build"],
    relevantInformation: [
      "Using TypeScript for type safety",
      "Tests use Node test runner",
    ],
    decisions: [
      "Use TypeBox instead of Zod for schemas",
      "Follow TDD approach",
    ],
    openQuestions: ["Should we add caching?", "How to handle rate limits?"],
  };

  const metadata: SessionMetadata = {
    model: "anthropic/claude-sonnet-4-5",
    thinkingLevel: "medium",
    tools: ["read", "write", "edit", "bash"],
    sessionName: "Handoff Implementation",
    git: { branch: "main", isDirty: true },
    lastSkill: "llm-evals",
  };

  it("includes handoff preamble when enabled", () => {
    const config = { ...DEFAULT_CONFIG, includeHandoffPreamble: true };
    const prompt = assembleHandoffPrompt(
      minimalExtraction,
      "implement the feature",
      undefined,
      config,
    );
    assert.ok(prompt.includes("# Handoff Context"));
    assert.ok(prompt.includes("continuing work from a previous thread"));
  });

  it("excludes handoff preamble when disabled", () => {
    const config = { ...DEFAULT_CONFIG, includeHandoffPreamble: false };
    const prompt = assembleHandoffPrompt(
      minimalExtraction,
      "implement the feature",
      undefined,
      config,
    );
    assert.ok(!prompt.includes("# Handoff Context"));
  });

  it("includes user goal verbatim at the bottom", () => {
    const goal = "implement team-level handoff with proper tests";
    const prompt = assembleHandoffPrompt(
      minimalExtraction,
      goal,
      undefined,
      DEFAULT_CONFIG,
    );
    assert.ok(prompt.includes("## Next Goal"));
    assert.ok(prompt.includes(goal));
    // Goal should be at the end
    const goalIndex = prompt.indexOf(goal);
    assert.ok(goalIndex > prompt.length / 2);
  });

  it("includes relevant information as bullets", () => {
    const prompt = assembleHandoffPrompt(
      fullExtraction,
      "continue",
      undefined,
      DEFAULT_CONFIG,
    );
    assert.ok(prompt.includes("## Context"));
    assert.ok(prompt.includes("- Using TypeScript for type safety"));
    assert.ok(prompt.includes("- Tests use Node test runner"));
  });

  it("includes decisions section", () => {
    const prompt = assembleHandoffPrompt(
      fullExtraction,
      "continue",
      undefined,
      DEFAULT_CONFIG,
    );
    assert.ok(prompt.includes("## Key Decisions"));
    assert.ok(prompt.includes("- Use TypeBox instead of Zod"));
  });

  it("includes open questions section", () => {
    const prompt = assembleHandoffPrompt(
      fullExtraction,
      "continue",
      undefined,
      DEFAULT_CONFIG,
    );
    assert.ok(prompt.includes("## Open Questions"));
    assert.ok(prompt.includes("- Should we add caching?"));
  });

  it("includes relevant files with reasons when enabled", () => {
    const config = { ...DEFAULT_CONFIG, includeFileReasons: true };
    const prompt = assembleHandoffPrompt(
      fullExtraction,
      "continue",
      undefined,
      config,
    );
    assert.ok(prompt.includes("## Relevant Files"));
    assert.ok(prompt.includes("src/index.ts"));
    assert.ok(prompt.includes("Main entry point"));
  });

  it("includes relevant files without reasons when disabled", () => {
    const config = { ...DEFAULT_CONFIG, includeFileReasons: false };
    const prompt = assembleHandoffPrompt(
      fullExtraction,
      "continue",
      undefined,
      config,
    );
    assert.ok(prompt.includes("## Relevant Files"));
    assert.ok(prompt.includes("- src/index.ts"));
    assert.ok(!prompt.includes("Main entry point"));
  });

  it("includes relevant commands", () => {
    const prompt = assembleHandoffPrompt(
      fullExtraction,
      "continue",
      undefined,
      DEFAULT_CONFIG,
    );
    assert.ok(prompt.includes("## Relevant Commands"));
    assert.ok(prompt.includes("- npm test"));
    assert.ok(prompt.includes("- npm run build"));
  });

  it("includes session metadata when enabled and provided", () => {
    const config = { ...DEFAULT_CONFIG, includeMetadata: true };
    const prompt = assembleHandoffPrompt(
      minimalExtraction,
      "continue",
      metadata,
      config,
    );
    assert.ok(prompt.includes("## Session Metadata"));
    assert.ok(prompt.includes("anthropic/claude-sonnet-4-5"));
    assert.ok(prompt.includes("thinking: medium"));
    assert.ok(prompt.includes("read, write, edit, bash"));
    assert.ok(prompt.includes("main (dirty)"));
  });

  it("excludes session metadata when disabled", () => {
    const config = { ...DEFAULT_CONFIG, includeMetadata: false };
    const prompt = assembleHandoffPrompt(
      minimalExtraction,
      "continue",
      metadata,
      config,
    );
    assert.ok(!prompt.includes("## Session Metadata"));
  });

  it("includes skill prefix when enabled and skill present", () => {
    const config = { ...DEFAULT_CONFIG, includeSkill: true };
    const prompt = assembleHandoffPrompt(
      minimalExtraction,
      "continue",
      metadata,
      config,
    );
    assert.ok(prompt.includes("/skill:llm-evals"));
  });

  it("excludes skill prefix when disabled", () => {
    const config = { ...DEFAULT_CONFIG, includeSkill: false };
    const prompt = assembleHandoffPrompt(
      minimalExtraction,
      "continue",
      metadata,
      config,
    );
    assert.ok(!prompt.includes("/skill:"));
  });

  it("excludes skill prefix when no skill in metadata", () => {
    const config = { ...DEFAULT_CONFIG, includeSkill: true };
    const metadataNoSkill = { ...metadata, lastSkill: undefined };
    const prompt = assembleHandoffPrompt(
      minimalExtraction,
      "continue",
      metadataNoSkill,
      config,
    );
    assert.ok(!prompt.includes("/skill:"));
  });

  it("omits empty sections", () => {
    const partialExtraction: ExtractionOutput = {
      relevantFiles: [{ path: "a.ts", reason: "test" }],
      relevantCommands: [],
      relevantInformation: ["some info"],
      decisions: [],
      openQuestions: [],
    };
    const prompt = assembleHandoffPrompt(
      partialExtraction,
      "continue",
      undefined,
      DEFAULT_CONFIG,
    );
    assert.ok(prompt.includes("## Relevant Files"));
    assert.ok(prompt.includes("## Context"));
    assert.ok(!prompt.includes("## Key Decisions"));
    assert.ok(!prompt.includes("## Open Questions"));
    assert.ok(!prompt.includes("## Relevant Commands"));
  });

  it("shows git branch as clean when not dirty", () => {
    const cleanMetadata: SessionMetadata = {
      git: { branch: "feature/handoff", isDirty: false },
    };
    const config = { ...DEFAULT_CONFIG, includeMetadata: true };
    const prompt = assembleHandoffPrompt(
      minimalExtraction,
      "continue",
      cleanMetadata,
      config,
    );
    assert.ok(prompt.includes("feature/handoff"));
    assert.ok(!prompt.includes("dirty"));
  });

  it("handles null git branch gracefully", () => {
    const noGitMetadata: SessionMetadata = {
      git: { branch: null, isDirty: false },
    };
    const config = { ...DEFAULT_CONFIG, includeMetadata: true };
    const prompt = assembleHandoffPrompt(
      minimalExtraction,
      "continue",
      noGitMetadata,
      config,
    );
    // Should not crash and git line should be omitted or show detached
    assert.ok(!prompt.includes("Git: null"));
  });
});

describe("assembleHandoffPrompt structure", () => {
  it("sections appear in correct order", () => {
    const extraction: ExtractionOutput = {
      relevantFiles: [{ path: "a.ts", reason: "test" }],
      relevantCommands: ["npm test"],
      relevantInformation: ["info"],
      decisions: ["decision"],
      openQuestions: ["question"],
    };
    const metadata: SessionMetadata = {
      model: "test/model",
      lastSkill: "test-skill",
    };
    const prompt = assembleHandoffPrompt(
      extraction,
      "do the thing",
      metadata,
      DEFAULT_CONFIG,
    );

    // Expected order: skill, preamble, context, decisions, open questions, files, commands, metadata, goal
    const skillIdx = prompt.indexOf("/skill:test-skill");
    const preambleIdx = prompt.indexOf("# Handoff Context");
    const contextIdx = prompt.indexOf("## Context");
    const decisionsIdx = prompt.indexOf("## Key Decisions");
    const questionsIdx = prompt.indexOf("## Open Questions");
    const filesIdx = prompt.indexOf("## Relevant Files");
    const commandsIdx = prompt.indexOf("## Relevant Commands");
    const metadataIdx = prompt.indexOf("## Session Metadata");
    const goalIdx = prompt.indexOf("## Next Goal");

    // Skill comes first (at the very top)
    assert.ok(skillIdx < preambleIdx);
    // Preamble before content
    assert.ok(preambleIdx < contextIdx);
    // Context sections before files/commands
    assert.ok(contextIdx < decisionsIdx);
    assert.ok(decisionsIdx < questionsIdx);
    // Files and commands after context sections
    assert.ok(questionsIdx < filesIdx);
    assert.ok(filesIdx < commandsIdx);
    // Metadata after files/commands
    assert.ok(commandsIdx < metadataIdx);
    // Goal is last
    assert.ok(metadataIdx < goalIdx);
  });
});
