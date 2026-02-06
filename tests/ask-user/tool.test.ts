import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAnswer, validateAnswers } from "../../extensions/ask-user/tool.js";
import type { Question } from "../../extensions/ask-user/types.js";

describe("buildAnswer", () => {
  it("builds answer from text response", () => {
    const question: Question = {
      question: "What is your name?",
    };

    const answer = buildAnswer(question, {
      value: "John",
      wasCustom: true,
    });

    assert.equal(answer.question, "What is your name?");
    assert.equal(answer.answer, "John");
    assert.equal(answer.wasCustom, true);
    assert.equal(answer.selectedOption, undefined);
  });

  it("builds answer from option selection", () => {
    const question: Question = {
      question: "Pick a color",
      options: [{ label: "Red" }, { label: "Blue" }],
    };

    const answer = buildAnswer(question, {
      value: "Red",
      selectedOption: "Red",
      wasCustom: false,
    });

    assert.equal(answer.answer, "Red");
    assert.equal(answer.selectedOption, "Red");
    assert.equal(answer.wasCustom, false);
  });

  it("builds answer from multi-select", () => {
    const question: Question = {
      question: "Pick features",
      options: [{ label: "Auth" }, { label: "API" }],
      multiSelect: true,
    };

    const answer = buildAnswer(question, {
      value: ["Auth", "API"],
      wasCustom: false,
    });

    assert.deepEqual(answer.answer, ["Auth", "API"]);
  });
});

describe("validateAnswers", () => {
  it("returns true when all questions answered", () => {
    const questions: Question[] = [
      { question: "Name?" },
      { question: "Age?" },
    ];

    const answers = [
      { question: "Name?", answer: "John", wasCustom: true },
      { question: "Age?", answer: "30", wasCustom: true },
    ];

    assert.ok(validateAnswers(questions, answers));
  });

  it("returns false when answer count mismatch", () => {
    const questions: Question[] = [{ question: "Name?" }, { question: "Age?" }];

    const answers = [{ question: "Name?", answer: "John", wasCustom: true }];

    assert.ok(!validateAnswers(questions, answers));
  });

  it("returns false when answer is empty", () => {
    const questions: Question[] = [{ question: "Name?" }];

    const answers = [{ question: "Name?", answer: "", wasCustom: true }];

    assert.ok(!validateAnswers(questions, answers));
  });

  it("returns false when multiSelect answer is empty array", () => {
    const questions: Question[] = [
      {
        question: "Features?",
        options: [{ label: "Auth" }],
        multiSelect: true,
      },
    ];

    const answers = [{ question: "Features?", answer: [], wasCustom: false }];

    assert.ok(!validateAnswers(questions, answers));
  });

  it("returns true when multiSelect has selections", () => {
    const questions: Question[] = [
      {
        question: "Features?",
        options: [{ label: "Auth" }],
        multiSelect: true,
      },
    ];

    const answers = [{ question: "Features?", answer: ["Auth"], wasCustom: false }];

    assert.ok(validateAnswers(questions, answers));
  });
});
