import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { describe, it, after } from "node:test";
import { createPendingFile } from "../../extensions/ask-user/modes/print.js";
import type { AskUserParams } from "../../extensions/ask-user/types.js";

// Mock context
const mockContext = {
  cwd: "/tmp",
  sessionManager: {
    getSessionFile: () => "test-session-123",
  },
} as any;

describe("createPendingFile", () => {
  const testFile = "/tmp/.pi/pending-questions.json";

  after(async () => {
    try {
      await rm(testFile, { force: true });
    } catch {
      // Ignore
    }
  });

  it("creates pending questions file", async () => {
    const params: AskUserParams = {
      questions: [
        {
          question: "What is your name?",
        },
        {
          question: "Pick a color",
          header: "Theme",
          options: [{ label: "Red" }, { label: "Blue" }],
        },
      ],
      metadata: { source: "test" },
    };

    const filePath = await createPendingFile(params, mockContext);

    assert.equal(filePath, testFile);

    // Read and verify file contents
    const content = await readFile(testFile, "utf-8");
    const data = JSON.parse(content);

    assert.equal(data.sessionId, "test-session-123");
    assert.ok(data.timestamp);
    assert.equal(data.questions.length, 2);

    // First question (text input)
    assert.equal(data.questions[0].question, "What is your name?");
    assert.equal(data.questions[0].answer, null);

    // Second question (with options)
    assert.equal(data.questions[1].question, "Pick a color");
    assert.equal(data.questions[1].header, "Theme");
    assert.deepEqual(data.questions[1].options, ["Red", "Blue"]);
    assert.equal(data.questions[1].answer, null);

    // Metadata
    assert.deepEqual(data.metadata, { source: "test" });
  });

  it("includes multiSelect flag", async () => {
    const params: AskUserParams = {
      questions: [
        {
          question: "Pick features",
          options: [{ label: "Auth" }, { label: "API" }],
          multiSelect: true,
        },
      ],
    };

    await createPendingFile(params, mockContext);

    const content = await readFile(testFile, "utf-8");
    const data = JSON.parse(content);

    assert.equal(data.questions[0].multiSelect, true);
  });
});
