import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Value } from "@sinclair/typebox/value";
import {
  ExtractionOutputSchema,
  RelevantFileSchema,
} from "../../extensions/handoff/types.js";

describe("RelevantFileSchema validation", () => {
  it("accepts valid file with path and reason", () => {
    const file = {
      path: "src/index.ts",
      reason: "Main entry point for the application",
    };
    assert.ok(Value.Check(RelevantFileSchema, file));
  });

  it("accepts file with relative path", () => {
    const file = {
      path: "./extensions/handoff/index.ts",
      reason: "Contains the handoff command",
    };
    assert.ok(Value.Check(RelevantFileSchema, file));
  });

  it("rejects file missing path", () => {
    const file = {
      reason: "Some reason",
    };
    assert.ok(!Value.Check(RelevantFileSchema, file));
  });

  it("rejects file missing reason", () => {
    const file = {
      path: "src/index.ts",
    };
    assert.ok(!Value.Check(RelevantFileSchema, file));
  });
});

describe("ExtractionOutputSchema validation", () => {
  it("accepts valid complete extraction", () => {
    const extraction = {
      relevantFiles: [
        { path: "src/index.ts", reason: "Entry point" },
        { path: "src/utils.ts", reason: "Helper functions" },
      ],
      relevantCommands: ["npm test", "npm run build"],
      relevantInformation: [
        "Using TypeScript for type safety",
        "Tests use Node test runner",
      ],
      decisions: ["Use TypeBox instead of Zod for schemas"],
      openQuestions: ["Should we add caching?"],
    };
    assert.ok(Value.Check(ExtractionOutputSchema, extraction));
  });

  it("accepts extraction with empty arrays", () => {
    const extraction = {
      relevantFiles: [],
      relevantCommands: [],
      relevantInformation: [],
      decisions: [],
      openQuestions: [],
    };
    assert.ok(Value.Check(ExtractionOutputSchema, extraction));
  });

  it("rejects extraction missing relevantFiles", () => {
    const extraction = {
      relevantCommands: [],
      relevantInformation: [],
      decisions: [],
      openQuestions: [],
    };
    assert.ok(!Value.Check(ExtractionOutputSchema, extraction));
  });

  it("rejects extraction missing relevantCommands", () => {
    const extraction = {
      relevantFiles: [],
      relevantInformation: [],
      decisions: [],
      openQuestions: [],
    };
    assert.ok(!Value.Check(ExtractionOutputSchema, extraction));
  });

  it("rejects extraction missing relevantInformation", () => {
    const extraction = {
      relevantFiles: [],
      relevantCommands: [],
      decisions: [],
      openQuestions: [],
    };
    assert.ok(!Value.Check(ExtractionOutputSchema, extraction));
  });

  it("rejects extraction missing decisions", () => {
    const extraction = {
      relevantFiles: [],
      relevantCommands: [],
      relevantInformation: [],
      openQuestions: [],
    };
    assert.ok(!Value.Check(ExtractionOutputSchema, extraction));
  });

  it("rejects extraction missing openQuestions", () => {
    const extraction = {
      relevantFiles: [],
      relevantCommands: [],
      relevantInformation: [],
      decisions: [],
    };
    assert.ok(!Value.Check(ExtractionOutputSchema, extraction));
  });

  it("rejects invalid file in relevantFiles array", () => {
    const extraction = {
      relevantFiles: [{ path: "src/index.ts" }], // missing reason
      relevantCommands: [],
      relevantInformation: [],
      decisions: [],
      openQuestions: [],
    };
    assert.ok(!Value.Check(ExtractionOutputSchema, extraction));
  });
});
