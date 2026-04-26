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

import { complete, type UserMessage } from "@mariozechner/pi-ai";
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
  Key,
  matchesKey,
  wrapTextWithAnsi,
  visibleWidth,
  type TUI,
} from "@mariozechner/pi-tui";

import { getRequestAuth } from "../shared/auth.js";
import {
  BTW_SYSTEM_PROMPT,
  buildBtwUserMessage,
  validateBtwArgs,
  extractResponseText,
} from "./btw.js";


/**
 * Overlay component that displays the BTW question and answer.
 * The full page scrolls together so large input and output remain usable.
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
  private maxScrollOffset = 0;

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
    if (
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl("c")) ||
      data === " " ||
      data.toLowerCase() === "q"
    ) {
      this.onDone();
      return;
    }

    const pageStep = Math.max(4, (this.tui.height ?? 24) - 8);

    if (matchesKey(data, Key.up) || data === "k") {
      if (this.scrollOffset > 0) {
        this.scrollOffset--;
        this.invalidate();
        this.tui.requestRender();
      }
      return;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      if (this.scrollOffset < this.maxScrollOffset) {
        this.scrollOffset++;
        this.invalidate();
        this.tui.requestRender();
      }
      return;
    }
    if (matchesKey(data, Key.pageUp)) {
      this.scrollOffset = Math.max(0, this.scrollOffset - pageStep);
      this.invalidate();
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.pageDown)) {
      this.scrollOffset = Math.min(this.maxScrollOffset, this.scrollOffset + pageStep);
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
    const boxWidth = Math.min(width - 2, 144);
    const contentWidth = Math.max(24, boxWidth - 8);

    const horizontalLine = (count: number) => "─".repeat(count);
    const meter = (value: number, total: number, size: number) => {
      if (total <= 0) return "░".repeat(size);
      const filled = Math.max(1, Math.min(size, Math.round((value / total) * size)));
      return "█".repeat(filled) + "░".repeat(Math.max(0, size - filled));
    };

    const fitInline = (text: string, targetWidth: number): string => {
      if (targetWidth <= 0) return "";
      const wrapped = wrapTextWithAnsi(text, targetWidth);
      return wrapped[0] ?? "";
    };

    const boxLine = (content: string, leftPad: number = 2): string => {
      const paddedContent = " ".repeat(leftPad) + fitInline(content, Math.max(0, boxWidth - leftPad - 3));
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

    const sectionTitle = (label: string, meta: string) => {
      const text = `${theme.fg("accent", theme.bold(label))}${theme.fg("muted", ` · ${meta}`)}`;
      return boxLine(text, 2);
    };

    const pushWrappedSection = (
      bodyLines: string[],
      label: string,
      meta: string,
      text: string,
      prefix: string,
    ) => {
      bodyLines.push(sectionTitle(label, meta));
      bodyLines.push(emptyBoxLine());
      for (const paragraph of text.split("\n")) {
        if (paragraph.trim() === "") {
          bodyLines.push(boxLine("", 2));
          continue;
        }
        const wrapped = wrapTextWithAnsi(paragraph, Math.max(12, contentWidth - visibleWidth(prefix)));
        for (const line of wrapped) {
          bodyLines.push(boxLine(`${prefix}${line}`, 2));
        }
      }
    };

    const questionWords = this.question.trim().split(/\s+/).filter(Boolean).length;
    const answerParagraphs = this.answer.split("\n").filter((line) => line.trim() !== "").length;

    const bodyLines: string[] = [];
    pushWrappedSection(bodyLines, "Question", `${questionWords} words`, this.question, theme.fg("muted", "› "));
    bodyLines.push(emptyBoxLine());
    bodyLines.push(boxLine(theme.fg("border", horizontalLine(Math.max(10, contentWidth - 6))), 3));
    bodyLines.push(emptyBoxLine());
    pushWrappedSection(bodyLines, "Answer", `${answerParagraphs} paragraphs`, this.answer, "");

    const termHeight = this.tui.height ?? 24;
    const fixedLines = 7;
    const maxVisibleBodyLines = Math.max(4, termHeight - fixedLines);
    this.maxScrollOffset = Math.max(0, bodyLines.length - maxVisibleBodyLines);
    if (this.scrollOffset > this.maxScrollOffset) {
      this.scrollOffset = this.maxScrollOffset;
    }

    const visibleBodyLines = bodyLines.slice(
      this.scrollOffset,
      this.scrollOffset + maxVisibleBodyLines,
    );

    const scrollCurrent = Math.min(bodyLines.length, this.scrollOffset + maxVisibleBodyLines);
    const scrollInfo = this.maxScrollOffset > 0
      ? `${this.scrollOffset + 1}-${scrollCurrent}/${bodyLines.length}`
      : "full";
    const progress = meter(scrollCurrent, Math.max(bodyLines.length, 1), 10);

    const lines: string[] = [];
    lines.push(padToWidth(theme.fg("accent", "╭" + horizontalLine(boxWidth - 2) + "╮")));
    lines.push(padToWidth(boxLine(`${theme.fg("accent", theme.bold("BTW"))}${theme.fg("muted", " · side question")}`, 2)));
    lines.push(padToWidth(boxLine(theme.fg("dim", "An editorial-style reading pane for long prompts and answers."), 2)));
    lines.push(padToWidth(theme.fg("accent", "├" + horizontalLine(boxWidth - 2) + "┤")));
    lines.push(...visibleBodyLines.map(padToWidth));
    lines.push(padToWidth(theme.fg("accent", "├" + horizontalLine(boxWidth - 2) + "┤")));
    lines.push(padToWidth(boxLine(`${theme.fg("accent", progress)} ${theme.fg("muted", scrollInfo)}${theme.fg("dim", "  ·  Esc dismiss  ·  ↑↓ / j k  ·  PgUp PgDn")}`, 2)));
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

  // Use the currently selected model
  const btwModel = ctx.model;

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
  }, {
    overlay: true,
    overlayOptions: {
      anchor: "center",
      width: "92%",
      maxHeight: "92%",
      margin: { top: 1, bottom: 1, left: 1, right: 1 },
    },
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
