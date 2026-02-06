import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseExtractionResponse,
  normalizeExtraction,
  extractJsonFromText,
  validateFilesAgainstConversation,
} from "../../extensions/handoff/parser.js";
import type { HandoffConfig } from "../../extensions/handoff/types.js";
import { DEFAULT_CONFIG } from "../../extensions/handoff/types.js";

describe("extractJsonFromText", () => {
  it("extracts JSON from plain JSON string", () => {
    const text = '{"relevantFiles": [], "relevantCommands": [], "relevantInformation": [], "decisions": [], "openQuestions": []}';
    const result = extractJsonFromText(text);
    assert.ok(result !== null);
    assert.deepEqual(result.relevantFiles, []);
  });

  it("extracts JSON from markdown code block", () => {
    const text = `Here is the extraction:

\`\`\`json
{
  "relevantFiles": [{"path": "src/index.ts", "reason": "Entry point"}],
  "relevantCommands": ["npm test"],
  "relevantInformation": ["Using TypeScript"],
  "decisions": ["Use TypeBox"],
  "openQuestions": []
}
\`\`\`

Let me know if you need more details.`;
    const result = extractJsonFromText(text);
    assert.ok(result !== null);
    assert.equal(result.relevantFiles.length, 1);
    assert.equal(result.relevantFiles[0].path, "src/index.ts");
  });

  it("extracts JSON from code block without json tag", () => {
    const text = `\`\`\`
{"relevantFiles": [], "relevantCommands": [], "relevantInformation": [], "decisions": [], "openQuestions": []}
\`\`\``;
    const result = extractJsonFromText(text);
    assert.ok(result !== null);
  });

  it("returns null for invalid JSON", () => {
    const text = "This is not JSON at all";
    const result = extractJsonFromText(text);
    assert.equal(result, null);
  });

  it("returns null for malformed JSON", () => {
    const text = '{"relevantFiles": [}';
    const result = extractJsonFromText(text);
    assert.equal(result, null);
  });

  it("handles JSON with extra text before and after", () => {
    const text = `I analyzed the conversation. Here's the structured output:
{"relevantFiles": [{"path": "a.ts", "reason": "test"}], "relevantCommands": [], "relevantInformation": [], "decisions": [], "openQuestions": []}
Hope this helps!`;
    const result = extractJsonFromText(text);
    assert.ok(result !== null);
    assert.equal(result.relevantFiles[0].path, "a.ts");
  });
});

describe("parseExtractionResponse", () => {
  it("parses valid extraction response", () => {
    const text = JSON.stringify({
      relevantFiles: [{ path: "src/index.ts", reason: "Entry" }],
      relevantCommands: ["npm test"],
      relevantInformation: ["Info 1"],
      decisions: ["Decision 1"],
      openQuestions: ["Question 1"],
    });
    const result = parseExtractionResponse(text);
    assert.ok(result.success);
    assert.ok(result.data);
    assert.equal(result.data.relevantFiles.length, 1);
  });

  it("returns error for invalid schema", () => {
    const text = JSON.stringify({
      relevantFiles: [{ path: "src/index.ts" }], // missing reason
      relevantCommands: [],
      relevantInformation: [],
      decisions: [],
      openQuestions: [],
    });
    const result = parseExtractionResponse(text);
    assert.ok(!result.success);
    assert.ok(result.error);
    assert.ok(result.error.includes("validation"));
  });

  it("returns error for unparseable text", () => {
    const text = "This is just plain text";
    const result = parseExtractionResponse(text);
    assert.ok(!result.success);
    assert.ok(result.error);
  });

  it("handles extraction from markdown code block", () => {
    const text = `\`\`\`json
{
  "relevantFiles": [],
  "relevantCommands": [],
  "relevantInformation": [],
  "decisions": [],
  "openQuestions": []
}
\`\`\``;
    const result = parseExtractionResponse(text);
    assert.ok(result.success);
  });
});

describe("normalizeExtraction", () => {
  const config: HandoffConfig = {
    ...DEFAULT_CONFIG,
    maxFiles: 3,
    maxCommands: 2,
    maxInformationItems: 2,
    maxDecisionItems: 2,
    maxOpenQuestions: 2,
  };

  it("caps relevantFiles to maxFiles", () => {
    const extraction = {
      relevantFiles: [
        { path: "a.ts", reason: "a" },
        { path: "b.ts", reason: "b" },
        { path: "c.ts", reason: "c" },
        { path: "d.ts", reason: "d" },
        { path: "e.ts", reason: "e" },
      ],
      relevantCommands: [],
      relevantInformation: [],
      decisions: [],
      openQuestions: [],
    };
    const result = normalizeExtraction(extraction, config);
    assert.equal(result.relevantFiles.length, 3);
  });

  it("caps relevantCommands to maxCommands", () => {
    const extraction = {
      relevantFiles: [],
      relevantCommands: ["cmd1", "cmd2", "cmd3", "cmd4"],
      relevantInformation: [],
      decisions: [],
      openQuestions: [],
    };
    const result = normalizeExtraction(extraction, config);
    assert.equal(result.relevantCommands.length, 2);
  });

  it("deduplicates files by path", () => {
    const extraction = {
      relevantFiles: [
        { path: "a.ts", reason: "first" },
        { path: "a.ts", reason: "duplicate" },
        { path: "b.ts", reason: "second" },
      ],
      relevantCommands: [],
      relevantInformation: [],
      decisions: [],
      openQuestions: [],
    };
    const result = normalizeExtraction(extraction, config);
    assert.equal(result.relevantFiles.length, 2);
    assert.equal(result.relevantFiles[0].reason, "first"); // keeps first
  });

  it("deduplicates commands", () => {
    const extraction = {
      relevantFiles: [],
      relevantCommands: ["npm test", "npm test", "npm run build"],
      relevantInformation: [],
      decisions: [],
      openQuestions: [],
    };
    const result = normalizeExtraction(extraction, config);
    assert.equal(result.relevantCommands.length, 2);
  });

  it("normalizes file paths by stripping @ prefix", () => {
    const extraction = {
      relevantFiles: [
        { path: "@src/index.ts", reason: "test" },
        { path: "src/utils.ts", reason: "test2" },
      ],
      relevantCommands: [],
      relevantInformation: [],
      decisions: [],
      openQuestions: [],
    };
    const result = normalizeExtraction(extraction, config);
    assert.equal(result.relevantFiles[0].path, "src/index.ts");
    assert.equal(result.relevantFiles[1].path, "src/utils.ts");
  });

  it("filters empty strings from arrays", () => {
    const extraction = {
      relevantFiles: [],
      relevantCommands: ["npm test", "", "  ", "npm build"],
      relevantInformation: ["info", "", "more info"],
      decisions: ["", "decision"],
      openQuestions: ["question", ""],
    };
    const result = normalizeExtraction(extraction, config);
    assert.equal(result.relevantCommands.length, 2);
    assert.equal(result.relevantInformation.length, 2);
    assert.equal(result.decisions.length, 1);
    assert.equal(result.openQuestions.length, 1);
  });

  it("caps all arrays to their respective limits", () => {
    const extraction = {
      relevantFiles: [],
      relevantCommands: [],
      relevantInformation: ["a", "b", "c", "d", "e"],
      decisions: ["a", "b", "c", "d", "e"],
      openQuestions: ["a", "b", "c", "d", "e"],
    };
    const result = normalizeExtraction(extraction, config);
    assert.equal(result.relevantInformation.length, 2);
    assert.equal(result.decisions.length, 2);
    assert.equal(result.openQuestions.length, 2);
  });

  it("validates files against conversation when enabled", () => {
    const configWithValidation: HandoffConfig = {
      ...DEFAULT_CONFIG,
      validateFiles: true,
      maxFiles: 10,
    };
    const extraction = {
      relevantFiles: [
        { path: "src/index.ts", reason: "mentioned" },
        { path: "src/invented.ts", reason: "not in conversation" },
        { path: "src/utils.ts", reason: "also mentioned" },
      ],
      relevantCommands: [],
      relevantInformation: [],
      decisions: [],
      openQuestions: [],
    };
    const conversationText = `
      User: Let's look at src/index.ts
      Assistant: I read src/index.ts and also checked src/utils.ts
    `;
    const result = normalizeExtraction(extraction, configWithValidation, conversationText);
    assert.equal(result.relevantFiles.length, 2);
    assert.equal(result.relevantFiles[0].path, "src/index.ts");
    assert.equal(result.relevantFiles[1].path, "src/utils.ts");
  });

  it("skips file validation when disabled", () => {
    const configWithoutValidation: HandoffConfig = {
      ...DEFAULT_CONFIG,
      validateFiles: false,
      maxFiles: 10,
    };
    const extraction = {
      relevantFiles: [
        { path: "src/index.ts", reason: "mentioned" },
        { path: "src/invented.ts", reason: "not in conversation" },
      ],
      relevantCommands: [],
      relevantInformation: [],
      decisions: [],
      openQuestions: [],
    };
    const conversationText = "User: Let's look at src/index.ts";
    const result = normalizeExtraction(extraction, configWithoutValidation, conversationText);
    assert.equal(result.relevantFiles.length, 2); // Both kept
  });

  it("skips file validation when no conversation text provided", () => {
    const configWithValidation: HandoffConfig = {
      ...DEFAULT_CONFIG,
      validateFiles: true,
      maxFiles: 10,
    };
    const extraction = {
      relevantFiles: [
        { path: "src/index.ts", reason: "test" },
        { path: "src/other.ts", reason: "test" },
      ],
      relevantCommands: [],
      relevantInformation: [],
      decisions: [],
      openQuestions: [],
    };
    const result = normalizeExtraction(extraction, configWithValidation);
    assert.equal(result.relevantFiles.length, 2); // Both kept - no validation without text
  });
});

describe("validateFilesAgainstConversation", () => {
  it("keeps files that are mentioned by full path", () => {
    const files = [
      { path: "src/index.ts", reason: "entry point" },
      { path: "src/utils.ts", reason: "utilities" },
    ];
    const conversation = "I modified src/index.ts and checked src/utils.ts";
    const result = validateFilesAgainstConversation(files, conversation);
    assert.equal(result.length, 2);
  });

  it("filters files not mentioned in conversation", () => {
    const files = [
      { path: "src/real.ts", reason: "exists" },
      { path: "src/invented.ts", reason: "hallucinated" },
    ];
    const conversation = "I looked at src/real.ts";
    const result = validateFilesAgainstConversation(files, conversation);
    assert.equal(result.length, 1);
    assert.equal(result[0].path, "src/real.ts");
  });

  it("matches by filename when full path not found", () => {
    const files = [
      { path: "src/components/Button.tsx", reason: "component" },
    ];
    const conversation = "Check the Button.tsx component for the issue";
    const result = validateFilesAgainstConversation(files, conversation);
    assert.equal(result.length, 1);
  });

  it("is case-insensitive", () => {
    const files = [
      { path: "src/MyComponent.tsx", reason: "component" },
    ];
    const conversation = "Look at mycomponent.tsx";
    const result = validateFilesAgainstConversation(files, conversation);
    assert.equal(result.length, 1);
  });

  it("handles empty files array", () => {
    const files: { path: string; reason: string }[] = [];
    const conversation = "Some conversation text";
    const result = validateFilesAgainstConversation(files, conversation);
    assert.equal(result.length, 0);
  });

  it("handles empty conversation text", () => {
    const files = [
      { path: "src/index.ts", reason: "entry" },
    ];
    const conversation = "";
    const result = validateFilesAgainstConversation(files, conversation);
    assert.equal(result.length, 0); // None match empty conversation
  });

  it("filters all hallucinated files", () => {
    const files = [
      { path: "src/api/routes.ts", reason: "API routes" },
      { path: "src/models/user.ts", reason: "User model" },
      { path: "src/services/auth.ts", reason: "Auth service" },
    ];
    const conversation = "We discussed the database schema";
    const result = validateFilesAgainstConversation(files, conversation);
    assert.equal(result.length, 0);
  });
});
