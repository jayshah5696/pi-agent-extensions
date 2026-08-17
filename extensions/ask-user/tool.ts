import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Answer, AskUserParams, AskUserResult, Question } from "./types.js";

/**
 * Main execute function for ask_user tool
 */
export async function executeAskUser(
  params: AskUserParams,
  ctx: ExtensionContext,
): Promise<AskUserResult> {
  // Detect mode
  const mode = detectMode(ctx);

  // Delegate to mode-specific handler
  switch (mode) {
    case "interactive":
      return executeInteractive(params, ctx);
    case "print":
      return executePrint(params, ctx);
    case "rpc":
      return executeRpc(params, ctx);
  }
}

/**
 * Detect which mode we're running in
 *
 * RPC mode: the UI is proxied to a remote host (e.g. cc-connect) which only
 * supports the simple dialog methods (select/confirm/input). In particular
 * ctx.ui.custom() is NOT supported there (it resolves to undefined
 * immediately, which would look like an instant cancel). The real TUI is
 * only available when stdout is an actual terminal.
 */
function detectMode(ctx: ExtensionContext): "interactive" | "print" | "rpc" {
  if (!ctx.hasUI) return "print";
  if (!process.stdout.isTTY) return "rpc";
  return "interactive";
}

/**
 * Interactive mode - show TUI
 */
async function executeInteractive(
  params: AskUserParams,
  ctx: ExtensionContext,
): Promise<AskUserResult> {
  // Import UI components (will implement next)
  const { showQuestions } = await import("./ui/index.js");

  const result = await showQuestions(params.questions, ctx);

  if (!result) {
    return {
      answered: false,
      answers: [],
      cancelled: true,
    };
  }

  return {
    answered: true,
    answers: result.answers,
  };
}

/**
 * Print mode - create pending questions file
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

/**
 * RPC mode - use simple proxied dialogs (select/input)
 *
 * The RPC UI protocol has no "custom component" concept, so the TUI option
 * picker is replaced with ctx.ui.select(). The select method only carries
 * plain strings, so option descriptions are folded into the label text.
 * "Other" is offered as an extra option and followed up with ctx.ui.input(),
 * mirroring the interactive flow.
 */
const OTHER_LABEL = "Other (type your answer)";

async function executeRpc(
  params: AskUserParams,
  ctx: ExtensionContext,
): Promise<AskUserResult> {
  const answers: Answer[] = [];

  for (const question of params.questions) {
    const answer = await askQuestionRpc(question, ctx);
    if (!answer) {
      return { answered: false, answers: [], cancelled: true };
    }
    answers.push(answer);
  }

  return { answered: true, answers };
}

async function askQuestionRpc(
  question: Question,
  ctx: ExtensionContext,
): Promise<Answer | null> {
  const title = question.header
    ? `${question.header}\n\n${question.question}`
    : question.question;

  // No options -> plain text input question
  if (!question.options?.length) {
    const value = await ctx.ui.input(question.header ?? "Question", question.question);
    if (value === undefined || value.trim() === "") return null;
    return { question: question.question, answer: value, wasCustom: true };
  }

  // Options -> select dialog (descriptions appended to labels)
  const labels = question.options.map(
    (opt: NonNullable<Question["options"]>[number]) =>
      opt.description ? `${opt.label} — ${opt.description}` : opt.label,
  );
  labels.push(OTHER_LABEL);

  const selected = await ctx.ui.select(title, labels);
  if (selected === undefined) return null;

  if (selected === OTHER_LABEL) {
    const value = await ctx.ui.input(question.header ?? "Question", question.question);
    if (value === undefined || value.trim() === "") return null;
    return {
      question: question.question,
      answer: value,
      selectedOption: OTHER_LABEL,
      wasCustom: true,
    };
  }

  const idx = labels.indexOf(selected);
  const label =
    idx >= 0 && idx < question.options.length ? question.options[idx].label : selected;
  return {
    question: question.question,
    answer: label,
    selectedOption: label,
    wasCustom: false,
  };
}

/**
 * Build answer object from user response
 */
export function buildAnswer(
  question: Question,
  response: { value: string | string[]; wasCustom: boolean; selectedOption?: string },
): Answer {
  return {
    question: question.question,
    answer: response.value,
    selectedOption: response.selectedOption,
    wasCustom: response.wasCustom,
  };
}

/**
 * Validate that all questions have answers
 */
export function validateAnswers(questions: Question[], answers: Answer[]): boolean {
  if (questions.length !== answers.length) return false;

  for (let i = 0; i < questions.length; i++) {
    const answer = answers[i];
    if (!answer || !answer.answer) return false;
    
    // For multiSelect, ensure array is not empty
    if (questions[i].multiSelect && Array.isArray(answer.answer) && answer.answer.length === 0) {
      return false;
    }
  }

  return true;
}
