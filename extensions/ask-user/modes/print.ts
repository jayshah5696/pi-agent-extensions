import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { AskUserParams, Question } from "../types.js";

interface PendingQuestion {
  question: string;
  header?: string;
  options?: string[];
  multiSelect?: boolean;
  answer: null;
}

interface PendingQuestionsFile {
  sessionId: string;
  timestamp: string;
  questions: PendingQuestion[];
  metadata?: Record<string, unknown>;
}

/**
 * Create a pending questions file for non-interactive mode
 */
export async function createPendingFile(params: AskUserParams, ctx: ExtensionContext): Promise<string> {
  const pendingDir = join(ctx.cwd, ".pi");
  const pendingFile = join(pendingDir, "pending-questions.json");

  // Ensure .pi directory exists
  await mkdir(pendingDir, { recursive: true });

  // Get session ID if available
  const sessionId = ctx.sessionManager.getSessionFile() ?? "unknown";

  // Build pending file structure
  const pending: PendingQuestionsFile = {
    sessionId,
    timestamp: new Date().toISOString(),
    questions: params.questions.map(questionToPending),
    metadata: params.metadata,
  };

  // Write file
  await writeFile(pendingFile, JSON.stringify(pending, null, 2), "utf-8");

  return pendingFile;
}

/**
 * Convert Question to PendingQuestion
 */
function questionToPending(q: Question): PendingQuestion {
  const pending: PendingQuestion = {
    question: q.question,
    answer: null,
  };

  if (q.header) pending.header = q.header;
  if (q.options) pending.options = q.options.map((o) => o.label);
  if (q.multiSelect) pending.multiSelect = q.multiSelect;

  return pending;
}
