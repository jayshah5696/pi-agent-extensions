import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BTW_SYSTEM_PROMPT,
  buildBtwUserMessage,
  validateBtwArgs,
  extractResponseText,
} from "../../extensions/btw/btw.js";

describe("validateBtwArgs", () => {
  it("returns error when args is undefined", () => {
    const result = validateBtwArgs(undefined);
    assert.equal(result.valid, false);
    assert.ok(result.error);
    assert.ok(result.error.includes("/btw"));
  });

  it("returns error when args is empty string", () => {
    const result = validateBtwArgs("");
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it("returns error when args is whitespace only", () => {
    const result = validateBtwArgs("   ");
    assert.equal(result.valid, false);
    assert.ok(result.error);
  });

  it("returns valid with trimmed question", () => {
    const result = validateBtwArgs("  what is useEffect?  ");
    assert.equal(result.valid, true);
    assert.equal(result.question, "what is useEffect?");
  });

  it("returns valid for a normal question", () => {
    const result = validateBtwArgs("what's the syntax for async/await?");
    assert.equal(result.valid, true);
    assert.equal(result.question, "what's the syntax for async/await?");
  });

  it("returns valid for single-word question", () => {
    const result = validateBtwArgs("help");
    assert.equal(result.valid, true);
    assert.equal(result.question, "help");
  });
});

describe("buildBtwUserMessage", () => {
  it("includes conversation context and question", () => {
    const message = buildBtwUserMessage(
      "User: Let's fix the auth bug\nAssistant: I'll look at login.ts",
      "What file are we looking at?",
    );
    assert.ok(message.includes("<conversation_context>"));
    assert.ok(message.includes("Let's fix the auth bug"));
    assert.ok(message.includes("<side_question>"));
    assert.ok(message.includes("What file are we looking at?"));
  });

  it("includes instruction to be concise", () => {
    const message = buildBtwUserMessage("context", "question");
    assert.ok(message.toLowerCase().includes("concise"));
  });

  it("wraps conversation in XML-style tags", () => {
    const message = buildBtwUserMessage("some context", "some question");
    assert.ok(message.includes("<conversation_context>"));
    assert.ok(message.includes("</conversation_context>"));
    assert.ok(message.includes("<side_question>"));
    assert.ok(message.includes("</side_question>"));
  });

  it("handles empty conversation context", () => {
    const message = buildBtwUserMessage("", "what is this?");
    assert.ok(message.includes("<conversation_context>"));
    assert.ok(message.includes("<side_question>"));
    assert.ok(message.includes("what is this?"));
  });

  it("handles multi-line conversation", () => {
    const conversation = [
      "User: Fix the bug",
      "Assistant: Looking at src/auth.ts",
      "User: Also check the tests",
      "Assistant: Found the issue in test/auth.test.ts",
    ].join("\n");
    const message = buildBtwUserMessage(conversation, "Which files were modified?");
    assert.ok(message.includes("src/auth.ts"));
    assert.ok(message.includes("test/auth.test.ts"));
    assert.ok(message.includes("Which files were modified?"));
  });
});

describe("BTW_SYSTEM_PROMPT", () => {
  it("mentions no tool access", () => {
    assert.ok(BTW_SYSTEM_PROMPT.toLowerCase().includes("no tool access"));
  });

  it("instructs concise answers", () => {
    assert.ok(BTW_SYSTEM_PROMPT.toLowerCase().includes("concise"));
  });

  it("mentions conversation context", () => {
    assert.ok(BTW_SYSTEM_PROMPT.toLowerCase().includes("conversation context"));
  });

  it("mentions being brief", () => {
    assert.ok(BTW_SYSTEM_PROMPT.toLowerCase().includes("brief"));
  });
});

describe("extractResponseText", () => {
  it("extracts text from single text content", () => {
    const content = [{ type: "text", text: "Hello world" }];
    assert.equal(extractResponseText(content), "Hello world");
  });

  it("joins multiple text blocks with newlines", () => {
    const content = [
      { type: "text", text: "First part" },
      { type: "text", text: "Second part" },
    ];
    assert.equal(extractResponseText(content), "First part\nSecond part");
  });

  it("filters out non-text content types", () => {
    const content = [
      { type: "text", text: "Hello" },
      { type: "tool_use", text: undefined },
      { type: "text", text: "World" },
    ];
    assert.equal(extractResponseText(content), "Hello\nWorld");
  });

  it("handles empty content array", () => {
    assert.equal(extractResponseText([]), "");
  });

  it("handles content with no text blocks", () => {
    const content = [
      { type: "tool_use" },
      { type: "image" },
    ];
    assert.equal(extractResponseText(content as any), "");
  });

  it("handles content with undefined text", () => {
    const content = [
      { type: "text", text: undefined },
      { type: "text", text: "Valid" },
    ];
    assert.equal(extractResponseText(content as any), "Valid");
  });
});
