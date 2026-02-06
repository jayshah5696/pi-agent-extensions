import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
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
 */
function detectMode(ctx: ExtensionContext): "interactive" | "print" | "rpc" {
  if (!ctx.hasUI) return "print";
  // TODO: Detect RPC mode when implemented
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
 * RPC mode - return structured request
 */
async function executeRpc(
  params: AskUserParams,
  ctx: ExtensionContext,
): Promise<AskUserResult> {
  // TODO: Implement RPC mode
  throw new Error("RPC mode not yet implemented");
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
