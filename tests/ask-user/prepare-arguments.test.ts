import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareAskUserArguments } from "../../extensions/ask-user/index.js";

describe("prepareAskUserArguments", () => {
  it("parses questions from a JSON string", () => {
    const questions = [{ question: "Which database?" }];
    const prepared = prepareAskUserArguments({
      questions: JSON.stringify(questions),
    });
    assert.deepEqual(prepared, { questions });
  });

  it("repairs raw control characters inside stringified questions", () => {
    // Models sometimes emit real newlines/tabs unescaped inside string values,
    // which is invalid JSON and used to fail schema validation.
    const prepared = prepareAskUserArguments({
      questions: '[{"question":"line one\nline\ttwo?"}]',
    });
    assert.deepEqual(prepared, {
      questions: [{ question: "line one\nline\ttwo?" }],
    });
  });

  it("passes through a valid array unchanged", () => {
    const input = { questions: [{ question: "Pick a color" }] };
    assert.equal(prepareAskUserArguments(input), input);
  });

  it("passes through non-object input unchanged", () => {
    assert.equal(prepareAskUserArguments(null), null);
    assert.equal(prepareAskUserArguments("nope"), "nope");
  });

  it("leaves unparseable strings untouched", () => {
    const input = { questions: "not json" };
    assert.deepEqual(prepareAskUserArguments(input), input);
  });
});
