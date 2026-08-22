import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Answer, AskUserParams, AskUserResult, Question } from "./types.js";

const OTHER_LABEL = "Other (type your answer)";

/**
 * Main execute function for ask_user tool.
 */
export async function executeAskUser(
  params: AskUserParams,
  ctx: ExtensionContext,
): Promise<AskUserResult> {
  if (!ctx.hasUI || ctx.mode === "print" || ctx.mode === "json") {
    return executePrint(params, ctx);
  }

  return executeDialogs(params, ctx);
}

/**
 * Ask questions through Pi's built-in dialog API. The API is backed by the
 * terminal UI in TUI mode and by the host protocol in RPC mode.
 */
async function executeDialogs(
  params: AskUserParams,
  ctx: ExtensionContext,
): Promise<AskUserResult> {
  const answers: Answer[] = [];

  for (const question of params.questions) {
    const answer = await askQuestion(question, ctx);
    if (!answer) {
      return { answered: false, answers: [], cancelled: true };
    }
    answers.push(answer);
  }

  return { answered: true, answers };
}

/**
 * Print mode - create pending questions file.
 */
async function executePrint(
  params: AskUserParams,
  ctx: ExtensionContext,
): Promise<AskUserResult> {
  const { createPendingFile } = await import("./modes/print.js");
  const pendingFile = await createPendingFile(params, ctx);

  return {
    answered: false,
    answers: [],
    pendingFile,
  };
}

async function askQuestion(question: Question, ctx: ExtensionContext): Promise<Answer | null> {
  const title = formatQuestionTitle(question);

  if (!question.options?.length) {
    const value = await ctx.ui.input(title, "Type your answer");
    if (value === undefined || value.trim() === "") return null;
    return { question: question.question, answer: value, wasCustom: true };
  }

  const labels = question.options.map((option) =>
    option.description ? `${option.label} — ${option.description}` : option.label,
  );
  labels.push(OTHER_LABEL);

  const selected = await ctx.ui.select(title, labels);
  if (selected === undefined) return null;

  if (selected === OTHER_LABEL) {
    const value = await askCustomAnswer(title, ctx);
    if (value === undefined || value.trim() === "") return null;
    return {
      question: question.question,
      answer: value,
      selectedOption: OTHER_LABEL,
      wasCustom: true,
    };
  }

  const index = labels.indexOf(selected);
  const label = index >= 0 && index < question.options.length
    ? question.options[index].label
    : selected;

  return {
    question: question.question,
    answer: label,
    selectedOption: label,
    wasCustom: false,
  };
}

function formatQuestionTitle(question: Question): string {
  return question.header
    ? `${question.header}\n\n${question.question}`
    : question.question;
}

function askCustomAnswer(title: string, ctx: ExtensionContext): Promise<string | undefined> {
  if (ctx.mode === "tui") return ctx.ui.editor(title);
  return ctx.ui.input(title, "Type your answer");
}
