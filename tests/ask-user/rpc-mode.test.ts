import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { executeAskUser } from "../../extensions/ask-user/tool.js";

// Force the RPC code path: detectMode() treats a non-TTY stdout as RPC mode.
// Each test file runs in its own process, so mutating isTTY is contained.
const originalIsTTY = process.stdout.isTTY;
Object.defineProperty(process.stdout, "isTTY", {
  value: false,
  configurable: true,
  writable: true,
});

after(() => {
  Object.defineProperty(process.stdout, "isTTY", {
    value: originalIsTTY,
    configurable: true,
    writable: true,
  });
});

interface MockUiState {
  selectCalls: { title: string; options: string[] }[];
  inputCalls: { title: string; placeholder?: string }[];
  selectResults: (string | undefined)[];
  inputResults: (string | undefined)[];
}

function mockRpcCtx(results: {
  select?: (string | undefined)[];
  input?: (string | undefined)[];
}): { ctx: ExtensionContext; ui: MockUiState } {
  const state: MockUiState = {
    selectCalls: [],
    inputCalls: [],
    selectResults: [...(results.select ?? [])],
    inputResults: [...(results.input ?? [])],
  };

  const ctx = {
    hasUI: true,
    ui: {
      select: async (title: string, options: string[]) => {
        state.selectCalls.push({ title, options });
        return state.selectResults.shift();
      },
      input: async (title: string, placeholder?: string) => {
        state.inputCalls.push({ title, placeholder });
        return state.inputResults.shift();
      },
    },
  } as unknown as ExtensionContext;

  return { ctx, ui: state };
}

describe("executeAskUser RPC mode", () => {
  it("asks a text question via ui.input", async () => {
    const { ctx, ui } = mockRpcCtx({ input: ["John"] });

    const result = await executeAskUser(
      { questions: [{ question: "What is your name?" }] },
      ctx,
    );

    assert.equal(result.answered, true);
    assert.equal(ui.inputCalls.length, 1);
    assert.equal(ui.inputCalls[0].placeholder, "What is your name?");
    assert.deepEqual(result.answers, [
      { question: "What is your name?", answer: "John", wasCustom: true },
    ]);
  });

  it("asks an options question via ui.select, folding descriptions into labels", async () => {
    const { ctx, ui } = mockRpcCtx({ select: ["Red — warm color"] });

    const result = await executeAskUser(
      {
        questions: [
          {
            question: "Pick a color",
            header: "Colors",
            options: [
              { label: "Red", description: "warm color" },
              { label: "Blue" },
            ],
          },
        ],
      },
      ctx,
    );

    assert.equal(result.answered, true);
    assert.equal(ui.selectCalls.length, 1);
    assert.equal(ui.selectCalls[0].title, "Colors\n\nPick a color");
    assert.deepEqual(ui.selectCalls[0].options, [
      "Red — warm color",
      "Blue",
      "Other (type your answer)",
    ]);
    // answer maps back to the original label, without the description suffix
    assert.deepEqual(result.answers, [
      {
        question: "Pick a color",
        answer: "Red",
        selectedOption: "Red",
        wasCustom: false,
      },
    ]);
  });

  it("follows up with ui.input when Other is selected", async () => {
    const { ctx, ui } = mockRpcCtx({
      select: ["Other (type your answer)"],
      input: ["Chartreuse"],
    });

    const result = await executeAskUser(
      {
        questions: [
          { question: "Pick a color", options: [{ label: "Red" }] },
        ],
      },
      ctx,
    );

    assert.equal(result.answered, true);
    assert.equal(ui.selectCalls.length, 1);
    assert.equal(ui.inputCalls.length, 1);
    assert.deepEqual(result.answers, [
      {
        question: "Pick a color",
        answer: "Chartreuse",
        selectedOption: "Other (type your answer)",
        wasCustom: true,
      },
    ]);
  });

  it("reports cancellation when select is dismissed", async () => {
    const { ctx } = mockRpcCtx({ select: [undefined] });

    const result = await executeAskUser(
      {
        questions: [
          { question: "Pick a color", options: [{ label: "Red" }] },
        ],
      },
      ctx,
    );

    assert.equal(result.answered, false);
    assert.equal(result.cancelled, true);
    assert.deepEqual(result.answers, []);
  });

  it("asks multiple questions sequentially", async () => {
    const { ctx, ui } = mockRpcCtx({
      select: ["Red"],
      input: ["John"],
    });

    const result = await executeAskUser(
      {
        questions: [
          { question: "Pick a color", options: [{ label: "Red" }] },
          { question: "What is your name?" },
        ],
      },
      ctx,
    );

    assert.equal(result.answered, true);
    assert.equal(ui.selectCalls.length, 1);
    assert.equal(ui.inputCalls.length, 1);
    assert.equal(result.answers.length, 2);
    assert.equal(result.answers[0].selectedOption, "Red");
    assert.equal(result.answers[1].answer, "John");
  });
});
