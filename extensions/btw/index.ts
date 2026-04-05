/**
 * BTW Extension
 *
 * Provides a `/btw` command for quick side questions that don't pollute
 * the conversation history. The answer appears in a temporary overlay
 * and is fully ephemeral — nothing is persisted to the session.
 *
 * Usage:
 *   /btw what's the syntax for useEffect cleanup?
 *   /btw which files did we modify?
 *   /btw why did you choose that approach?
 *
 * Key behaviors:
 * - Full visibility into current conversation context
 * - No tool access (lightweight, read-only)
 * - Answer displayed in dismissable overlay
 * - Zero context cost — no tokens wasted on history
 */

import { complete, type Model, type Api, type UserMessage } from "@mariozechner/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import {
  BorderedLoader,
  convertToLlm,
  serializeConversation,
} from "@mariozechner/pi-coding-agent";
import {
  type Component,
  Container,
  Key,
  matchesKey,
  Text,
  wrapTextWithAnsi,
  visibleWidth,
  type TUI,
} from "@mariozechner/pi-tui";

import { getRequestAuth, hasRequestAuth } from "../shared/auth.js";
import {
  BTW_SYSTEM_PROMPT,
  buildBtwUserMessage,
  validateBtwArgs,
  extractResponseText,
} from "./btw.js";

const HAIKU_MODEL_ID = "claude-haiku-4-5";
const CODEX_MODEL_ID = "gpt-5.1-codex-mini";

/**
 * Select a cheap/fast model for BTW side questions.
 * Prefers Codex mini → Haiku → current model.
 */
async function selectBtwModel(
  currentModel: Model<Api>,
  modelRegistry: {
    find: (provider: string, modelId: string) => Model<Api> | undefined;
    getApiKeyAndHeaders: (
      model: Model<Api>,
    ) => Promise<
      | { ok: true; apiKey?: string; headers?: Record<string, string> }
      | { ok: false; error: string }
    >;
  },
): Promise<Model<Api>> {
  // Try Codex mini first (cheapest)
  const codexModel = modelRegistry.find("openai-codex", CODEX_MODEL_ID);
  if (codexModel && (await hasRequestAuth(modelRegistry, codexModel))) {
    return codexModel;
  }

  // Try Haiku (fast & cheap)
  const haikuModel = modelRegistry.find("anthropic", HAIKU_MODEL_ID);
  if (haikuModel && (await hasRequestAuth(modelRegistry, haikuModel))) {
    return haikuModel;
  }

  // Fallback to current model
  return currentModel;
}

/**
 * Overlay component that displays the BTW answer.
 * Supports scrolling for long answers.
 */
class BtwOverlay implements Component {
  private tui: TUI;
  private theme: any;
  private question: string;
  private answer: string;
  private onDone: () => void;
  private scrollOffset = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    tui: TUI,
    theme: any,
    question: string,
    answer: string,
    onDone: () => void,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.question = question;
    this.answer = answer;
    this.onDone = onDone;
  }

  handleInput(data: string): void {
    // Dismiss overlay
    if (
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl("c")) ||
      data === " " ||
      data.toLowerCase() === "q"
    ) {
      this.onDone();
      return;
    }

    // Scroll
    if (matchesKey(data, Key.up) || data === "k") {
      if (this.scrollOffset > 0) {
        this.scrollOffset--;
        this.invalidate();
        this.tui.requestRender();
      }
      return;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      this.scrollOffset++;
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    // Page up/down
    if (matchesKey(data, Key.pageUp)) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 10);
      this.invalidate();
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.pageDown)) {
      this.scrollOffset += 10;
      this.invalidate();
      this.tui.requestRender();
      return;
    }
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const theme = this.theme;
    const boxWidth = Math.min(width - 2, 120);
    const contentWidth = boxWidth - 6; // padding on each side

    const horizontalLine = (count: number) => "─".repeat(count);

    const boxLine = (content: string, leftPad: number = 2): string => {
      const paddedContent = " ".repeat(leftPad) + content;
      const contentLen = visibleWidth(paddedContent);
      const rightPad = Math.max(0, boxWidth - contentLen - 2);
      return theme.fg("border", "│") + paddedContent + " ".repeat(rightPad) + theme.fg("border", "│");
    };

    const emptyBoxLine = (): string => {
      return theme.fg("border", "│") + " ".repeat(boxWidth - 2) + theme.fg("border", "│");
    };

    const padToWidth = (line: string): string => {
      const len = visibleWidth(line);
      return line + " ".repeat(Math.max(0, width - len));
    };

    const lines: string[] = [];

    // Top border
    lines.push(padToWidth(theme.fg("accent", "╭" + horizontalLine(boxWidth - 2) + "╮")));

    // Title
    const title = theme.fg("accent", theme.bold("btw"));
    lines.push(padToWidth(boxLine(title)));

    // Separator
    lines.push(padToWidth(theme.fg("accent", "├" + horizontalLine(boxWidth - 2) + "┤")));

    // Question
    const questionLabel = theme.fg("muted", "Q: ") + theme.fg("text", this.question);
    const wrappedQuestion = wrapTextWithAnsi(questionLabel, contentWidth);
    for (const line of wrappedQuestion) {
      lines.push(padToWidth(boxLine(line)));
    }

    lines.push(padToWidth(emptyBoxLine()));

    // Separator between question and answer
    lines.push(padToWidth(theme.fg("border", "├" + horizontalLine(boxWidth - 2) + "┤")));
    lines.push(padToWidth(emptyBoxLine()));

    // Answer — wrap and apply scroll
    const answerLines: string[] = [];
    for (const paragraph of this.answer.split("\n")) {
      if (paragraph.trim() === "") {
        answerLines.push("");
      } else {
        const wrapped = wrapTextWithAnsi(paragraph, contentWidth);
        answerLines.push(...wrapped);
      }
    }

    // Clamp scroll offset
    const termHeight = this.tui.height ?? 24;
    const headerLines = lines.length;
    const footerLines = 3; // separator + hint + bottom border
    const maxVisibleAnswerLines = Math.max(1, termHeight - headerLines - footerLines - 2);

    if (this.scrollOffset > Math.max(0, answerLines.length - maxVisibleAnswerLines)) {
      this.scrollOffset = Math.max(0, answerLines.length - maxVisibleAnswerLines);
    }

    const visibleAnswerLines = answerLines.slice(
      this.scrollOffset,
      this.scrollOffset + maxVisibleAnswerLines,
    );

    for (const line of visibleAnswerLines) {
      lines.push(padToWidth(boxLine(line)));
    }

    // Scroll indicator
    if (answerLines.length > maxVisibleAnswerLines) {
      const scrollInfo = theme.fg("dim", `[${this.scrollOffset + 1}-${Math.min(this.scrollOffset + maxVisibleAnswerLines, answerLines.length)}/${answerLines.length}]`);
      lines.push(padToWidth(boxLine(scrollInfo)));
    }

    lines.push(padToWidth(emptyBoxLine()));

    // Footer
    lines.push(padToWidth(theme.fg("accent", "├" + horizontalLine(boxWidth - 2) + "┤")));
    const hint = theme.fg("dim", "Esc/Space/q to dismiss · ↑↓/j/k scroll · PgUp/PgDn");
    lines.push(padToWidth(boxLine(hint)));
    lines.push(padToWidth(theme.fg("accent", "╰" + horizontalLine(boxWidth - 2) + "╯")));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }
}

/**
 * Main /btw command handler
 */
async function runBtwCommand(
  args: string | undefined,
  ctx: ExtensionCommandContext,
): Promise<void> {
  // Validate args
  const validation = validateBtwArgs(args);
  if (!validation.valid) {
    if (ctx.hasUI) {
      ctx.ui.notify(validation.error!, "error");
    } else {
      console.error(validation.error);
    }
    return;
  }
  const question = validation.question!;

  // Check for model
  if (!ctx.model) {
    const errorMsg = "No model selected. Use /model to select a model first.";
    if (ctx.hasUI) {
      ctx.ui.notify(errorMsg, "error");
    } else {
      console.error(errorMsg);
    }
    return;
  }

  // Build conversation context
  const sessionContext = ctx.sessionManager.buildSessionContext();
  const messages = sessionContext.messages;

  let conversationText = "";
  if (messages.length > 0) {
    const llmMessages = convertToLlm(messages);
    conversationText = serializeConversation(llmMessages);
  }

  // Select model (prefer cheap models)
  const btwModel = await selectBtwModel(ctx.model, ctx.modelRegistry);

  // Build LLM messages
  const userMessage: UserMessage = {
    role: "user",
    content: [{ type: "text", text: buildBtwUserMessage(conversationText, question) }],
    timestamp: Date.now(),
  };

  if (!ctx.hasUI) {
    // Non-interactive mode: print answer to stdout
    const requestAuth = await getRequestAuth(ctx.modelRegistry, btwModel);
    const response = await complete(
      btwModel,
      { systemPrompt: BTW_SYSTEM_PROMPT, messages: [userMessage] },
      { ...requestAuth },
    );

    if (response.stopReason === "error") {
      console.error(response.errorMessage ?? "LLM error");
      return;
    }

    const answerText = extractResponseText(response.content);
    console.log(`\n> btw: ${question}\n`);
    console.log(answerText);
    return;
  }

  // Interactive mode: show loader, then overlay

  // Step 1: Get the answer with a loading spinner
  const answerResult = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    const loader = new BorderedLoader(
      tui,
      theme,
      `Thinking (${btwModel.id})...`,
    );
    loader.onAbort = () => done(null);

    const doQuery = async () => {
      const requestAuth = await getRequestAuth(ctx.modelRegistry, btwModel);
      const response = await complete(
        btwModel,
        { systemPrompt: BTW_SYSTEM_PROMPT, messages: [userMessage] },
        { ...requestAuth, signal: loader.signal },
      );

      if (response.stopReason === "aborted") {
        return null;
      }

      if (response.stopReason === "error") {
        return null;
      }

      return extractResponseText(response.content);
    };

    doQuery()
      .then(done)
      .catch((err) => {
        console.error("BTW query failed:", err);
        done(null);
      });

    return loader;
  });

  if (answerResult === null) {
    ctx.ui.notify("Cancelled", "info");
    return;
  }

  if (answerResult.trim() === "") {
    ctx.ui.notify("No answer received", "warning");
    return;
  }

  // Step 2: Show the answer in an overlay
  await ctx.ui.custom<void>((tui, theme, _kb, done) => {
    return new BtwOverlay(tui, theme, question, answerResult, done);
  });

  // Nothing persisted — fully ephemeral
}

/**
 * Main extension entry point
 */
export default function btwExtension(pi: ExtensionAPI) {
  pi.registerCommand("btw", {
    description: "Ask a quick side question without polluting conversation history",
    handler: async (args, ctx) => {
      await runBtwCommand(args, ctx);
    },
  });
}
