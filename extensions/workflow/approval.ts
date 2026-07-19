import { type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type TUI } from "@earendil-works/pi-tui";
import { formatWorkflowApproval } from "./preview.js";
import type { WorkflowPreview } from "./types.js";

type ApprovalTab = "script" | "summary";

export async function requestWorkflowApproval(
  ctx: ExtensionContext,
  preview: WorkflowPreview,
): Promise<boolean> {
  if (ctx.mode !== "tui") {
    return ctx.ui.confirm(`Run workflow “${preview.name}”?`, `${formatWorkflowApproval(preview)}\n\nJavaScript:\n${preview.script}`);
  }
  return ctx.ui.custom<boolean>((tui, theme, _keybindings, done) =>
    new WorkflowApprovalView(tui, theme, preview, done),
  );
}

export class WorkflowApprovalView {
  private tab: ApprovalTab = "script";
  private scrollOffset = 0;
  private totalLines = 0;
  private viewHeight = 1;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly preview: WorkflowPreview,
    private readonly done: (approved: boolean) => void,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    const height = Math.max(14, Math.floor((this.tui.terminal.rows || 24) * 0.82));
    const innerWidth = Math.max(20, width - 2);
    const contentHeight = Math.max(4, height - 9);
    const tabs = this.tab === "script"
      ? `${this.theme.fg("accent", "[JavaScript]")}  ${this.theme.fg("muted", "Summary")}`
      : `${this.theme.fg("muted", "JavaScript")}  ${this.theme.fg("accent", "[Summary]")}`;
    const content = this.tab === "script" ? this.scriptLines(innerWidth) : this.summaryLines(innerWidth);
    this.totalLines = content.length;
    this.viewHeight = contentHeight;
    this.clampScroll();
    const lines = [
      this.theme.fg("accent", this.theme.bold(`Review workflow before running: ${this.preview.name}`)),
      this.theme.fg("muted", `${this.preview.description} · ${this.preview.staticAgentCalls} agent call sites · ${this.preview.maxAgents} max`),
      tabs,
      "",
      ...content.slice(this.scrollOffset, this.scrollOffset + contentHeight),
    ];
    while (lines.length < height - 3) lines.push("");
    const range = this.totalLines > this.viewHeight
      ? ` · ${this.scrollOffset + 1}-${Math.min(this.totalLines, this.scrollOffset + this.viewHeight)}/${this.totalLines}`
      : "";
    lines.push(this.theme.fg("dim", `tab/←→ script or summary · ↑↓/pgup/pgdn scroll${range}`));
    lines.push(`${this.theme.fg("success", "y approve and run")} · ${this.theme.fg("error", "n/esc reject")}`);
    return frame(this.theme, lines, width);
  }

  handleInput(data: string): void {
    if (data.toLowerCase() === "y") return this.done(true);
    if (data.toLowerCase() === "n" || matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      return this.done(false);
    }
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
      this.tab = this.tab === "script" ? "summary" : "script";
      this.scrollOffset = 0;
      this.tui.requestRender();
      return;
    }
    let delta = 0;
    if (matchesKey(data, Key.up)) delta = -1;
    else if (matchesKey(data, Key.down)) delta = 1;
    else if (matchesKey(data, Key.pageUp)) delta = -this.viewHeight;
    else if (matchesKey(data, Key.pageDown)) delta = this.viewHeight;
    else return;
    this.scrollOffset += delta;
    this.clampScroll();
    this.tui.requestRender();
  }

  private scriptLines(width: number): string[] {
    const numberWidth = String(this.preview.script.split(/\r?\n/).length).length;
    return this.preview.script.split(/\r?\n/).flatMap((line, index) => {
      const prefix = `${String(index + 1).padStart(numberWidth)} │ `;
      const wrapped = wrapTextWithAnsi(line || " ", Math.max(8, width - visibleWidth(prefix)));
      return wrapped.map((part, partIndex) =>
        `${this.theme.fg("dim", partIndex === 0 ? prefix : " ".repeat(visibleWidth(prefix)))}${this.theme.fg("text", part)}`,
      );
    });
  }

  private summaryLines(width: number): string[] {
    return formatWorkflowApproval(this.preview).split(/\r?\n/).flatMap((line) =>
      wrapTextWithAnsi(line || " ", width),
    );
  }

  private clampScroll(): void {
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, Math.max(0, this.totalLines - this.viewHeight)));
  }
}

function frame(theme: Theme, lines: string[], width: number): string[] {
  const innerWidth = Math.max(10, width - 2);
  const border = (text: string) => theme.fg("borderMuted", text);
  return [
    border(`┌${"─".repeat(innerWidth)}┐`),
    ...lines.map((line) => {
      const truncated = truncateToWidth(line, innerWidth);
      return `${border("│")}${truncated}${" ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)))}${border("│")}`;
    }),
    border(`└${"─".repeat(innerWidth)}┘`),
  ].map((line) => truncateToWidth(line, width));
}
