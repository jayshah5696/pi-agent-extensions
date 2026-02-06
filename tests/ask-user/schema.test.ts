import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Value } from "@sinclair/typebox/value";
import { AskUserParams, QuestionSchema } from "../../extensions/ask-user/types.js";

describe("QuestionSchema validation", () => {
  it("accepts valid text question (no options)", () => {
    const question = {
      question: "What is your name?",
    };
    assert.ok(Value.Check(QuestionSchema, question));
  });

  it("accepts question with options", () => {
    const question = {
      question: "Which database?",
      options: [
        { label: "PostgreSQL" },
        { label: "SQLite", description: "Lightweight" },
      ],
    };
    assert.ok(Value.Check(QuestionSchema, question));
  });

  it("accepts question with header", () => {
    const question = {
      question: "Pick a color",
      header: "Theme Settings",
    };
    assert.ok(Value.Check(QuestionSchema, question));
  });

  it("accepts question with multiSelect", () => {
    const question = {
      question: "Which features?",
      options: [{ label: "Auth" }, { label: "API" }],
      multiSelect: true,
    };
    assert.ok(Value.Check(QuestionSchema, question));
  });

  it("rejects question with empty string", () => {
    const question = { question: "" };
    assert.ok(!Value.Check(QuestionSchema, question));
  });

  it("rejects option with empty label", () => {
    const question = {
      question: "Pick one",
      options: [{ label: "" }],
    };
    assert.ok(!Value.Check(QuestionSchema, question));
  });
});

describe("AskUserParams validation", () => {
  it("accepts single question", () => {
    const params = {
      questions: [{ question: "Name?" }],
    };
    assert.ok(Value.Check(AskUserParams, params));
  });

  it("accepts multiple questions", () => {
    const params = {
      questions: [{ question: "Name?" }, { question: "Age?" }],
    };
    assert.ok(Value.Check(AskUserParams, params));
  });

  it("accepts questions with metadata", () => {
    const params = {
      questions: [{ question: "Name?" }],
      metadata: { source: "setup" },
    };
    assert.ok(Value.Check(AskUserParams, params));
  });

  it("rejects empty questions array", () => {
    const params = { questions: [] };
    assert.ok(!Value.Check(AskUserParams, params));
  });

  it("rejects missing questions", () => {
    const params = {};
    assert.ok(!Value.Check(AskUserParams, params));
  });
});
