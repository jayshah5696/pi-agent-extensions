import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { executeAskUser } from "../../extensions/ask-user/tool.js";

interface MockUiState {
  selectCalls: { title: string; options: string[] }[];
  inputCalls: { title: string; placeholder?: string }[];
  editorCalls: { title: string }[];
  selectResults: (string | undefined)[];
  inputResults: (string | undefined)[];
  editorResults: (string | undefined)[];
}

function mockCtx(
  mode: ExtensionContext["mode"],
  results: {
    select?: (string | undefined)[];
    input?: (string | undefined)[];
    editor?: (string | undefined)[];
  },
): { ctx: ExtensionContext; ui: MockUiState } {
  const state: MockUiState = {
    selectCalls: [],
    inputCalls: [],
    editorCalls: [],
    selectResults: [...(results.select ?? [])],
    inputResults: [...(results.input ?? [])],
    editorResults: [...(results.editor ?? [])],
  };

  const ctx = {
    hasUI: true,
    mode,
    ui: {
      select: async (title: string, options: string[]) => {
        state.selectCalls.push({ title, options });
        return state.selectResults.shift();
      },
      input: async (title: string, placeholder?: string) => {
        state.inputCalls.push({ title, placeholder });
        return state.inputResults.shift();
      },
      editor: async (title: string) => {
        state.editorCalls.push({ title });
        return state.editorResults.shift();
      },
    },
  } as unknown as ExtensionContext;

  return { ctx, ui: state };
}

describe("executeAskUser dialog mode", () => {
  it("asks a text question through the built-in input dialog", async () => {
    const { ctx, ui } = mockCtx("rpc", { input: ["John"] });

    const result = await executeAskUser(
      { questions: [{ question: "What is your name?" }] },
      ctx,
    );

    assert.equal(result.answered, true);
    assert.deepEqual(ui.inputCalls, [
      { title: "What is your name?", placeholder: "Type your answer" },
    ]);
    assert.deepEqual(result.answers, [
      { question: "What is your name?", answer: "John", wasCustom: true },
    ]);
  });

  it("passes long titles and option labels intact to Pi", async () => {
    const question = "Which database should this very long question continue displaying across narrow terminal lines?";
    const label = "PostgreSQL with a deliberately long option label that must remain visible";
    const description = "A deliberately long explanation that Pi should wrap instead of truncating at the terminal edge.";
    const { ctx, ui } = mockCtx("tui", { select: [label + " — " + description] });

    const result = await executeAskUser(
      {
        questions: [
          {
            header: "Database choice",
            question,
            options: [{ label, description }, { label: "SQLite" }],
          },
        ],
      },
      ctx,
    );

    assert.equal(ui.selectCalls[0]?.title, `Database choice\n\n${question}`);
    assert.deepEqual(ui.selectCalls[0]?.options, [
      `${label} — ${description}`,
      "SQLite",
      "Other (type your answer)",
    ]);
    assert.equal(result.answers[0]?.answer, label);
  });

  it("uses the built-in multiline editor for Other in TUI mode", async () => {
    const { ctx, ui } = mockCtx("tui", {
      select: ["Other (type your answer)"],
      editor: ["Chartreuse\nwith a note"],
    });

    const result = await executeAskUser(
      {
        questions: [
          { question: "Pick a color", options: [{ label: "Red" }] },
        ],
      },
      ctx,
    );

    assert.equal(ui.editorCalls[0]?.title, "Pick a color");
    assert.equal(ui.inputCalls.length, 0);
    assert.deepEqual(result.answers[0], {
      question: "Pick a color",
      answer: "Chartreuse\nwith a note",
      selectedOption: "Other (type your answer)",
      wasCustom: true,
    });
  });

  it("uses input for Other in RPC mode", async () => {
    const { ctx, ui } = mockCtx("rpc", {
      select: ["Other (type your answer)"],
      input: ["Chartreuse"],
    });

    const result = await executeAskUser(
      {
        questions: [
          { header: "Colors", question: "Pick a color", options: [{ label: "Red" }] },
        ],
      },
      ctx,
    );

    assert.deepEqual(ui.inputCalls, [
      { title: "Colors\n\nPick a color", placeholder: "Type your answer" },
    ]);
    assert.deepEqual(result.answers[0], {
      question: "Pick a color",
      answer: "Chartreuse",
      selectedOption: "Other (type your answer)",
      wasCustom: true,
    });
  });

  it("reports cancellation when a dialog is dismissed", async () => {
    const { ctx } = mockCtx("rpc", { select: [undefined] });

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
    const { ctx, ui } = mockCtx("rpc", {
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
