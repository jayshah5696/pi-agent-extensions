import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { copyToClipboard, getMarkdownTheme, type ExtensionCommandContext, type Theme } from "@earendil-works/pi-coding-agent";
import { Key, Markdown, matchesKey, truncateToWidth, visibleWidth, type TUI } from "@earendil-works/pi-tui";
import type { PersistedRunState, WorkflowAgentSnapshot, WorkflowManager } from "./runtime.js";

type RunFilter = "all" | "active" | "completed" | "failed";
type DetailTab = "result" | "progress" | "agents" | "workflow";
type Screen = "runs" | "detail" | "agent";

export type WorkflowBrowserExit = "new" | "saved" | "setup" | "settings" | null;

export interface WorkflowRunBrowserOptions {
  initialFilter?: RunFilter;
  initialRunId?: string;
}

const FILTERS: RunFilter[] = ["all", "active", "completed", "failed"];
const TABS: DetailTab[] = ["result", "progress", "agents", "workflow"];

export async function openWorkflowRunBrowser(
  manager: WorkflowManager,
  cwd: string,
  ctx: ExtensionCommandContext,
  options: WorkflowRunBrowserOptions = {},
): Promise<WorkflowBrowserExit> {
  if (!ctx.hasUI) return null;
  return ctx.ui.custom<WorkflowBrowserExit>((tui, theme, _kb, done) =>
    new WorkflowRunBrowser(tui, theme, manager, cwd, options, done, (message, level = "info") => {
      ctx.ui.notify(message, level);
    }),
  );
}

export function workflowResultMarkdown(run: PersistedRunState): string {
  const value = run.result?.result ?? run.snapshot.result;
  if (value === undefined || value === null) {
    if (run.error) return `# Workflow failed\n\n${run.error}`;
    return run.status === "completed" ? "_The workflow completed without a result._" : "_No result yet._";
  }
  if (typeof value === "string") return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ["report", "markdown", "content", "text", "summary"]) {
      if (typeof record[key] === "string" && record[key].trim()) return record[key] as string;
    }
  }
  return `# Workflow result\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

export function formatWorkflowRunSummary(run: PersistedRunState): string {
  const duration = run.result?.durationMs ?? run.snapshot.durationMs ?? elapsedMs(run.startedAt, run.updatedAt);
  return [
    `Status: ${run.status}`,
    `Agents: ${run.snapshot.doneCount}/${run.snapshot.agentCount}`,
    `Duration: ${formatDuration(duration)}`,
    `Tokens: ${formatTokens(run.snapshot.tokens)}`,
    `Cost: $${run.snapshot.cost.toFixed(4)}`,
  ].join(" · ");
}

export function exportWorkflowReport(
  run: PersistedRunState,
  cwd: string,
  format: "markdown" | "html",
  directory = workflowExportsDir(cwd),
): string {
  mkdirSync(directory, { recursive: true });
  const extension = format === "html" ? "html" : "md";
  const path = join(directory, `${run.runId}.${extension}`);
  const content = format === "html" ? workflowReportHtml(run) : workflowReportFile(run);
  writeFileSync(path, content, "utf8");
  return path;
}

export function saveWorkflowScript(run: PersistedRunState, cwd: string): string {
  const directory = join(cwd, ".pi", "workflows");
  mkdirSync(directory, { recursive: true });
  const slug = safeSlug(run.workflowName) || "workflow";
  let path = join(directory, `${slug}.js`);
  if (existsSync(path) && readFileSync(path, "utf8") !== run.script) {
    path = join(directory, `${slug}-${run.runId.slice(-6)}.js`);
  }
  writeFileSync(path, `${run.script.trimEnd()}\n`, "utf8");
  return path;
}

export class WorkflowRunBrowser {
  private filter: RunFilter;
  private screen: Screen;
  private selectedRunId?: string;
  private selectedAgentIndex = 0;
  private selectedAgent?: WorkflowAgentSnapshot;
  private tab: DetailTab = "result";
  private scrollOffset = 0;
  private totalLines = 0;
  private viewHeight = 1;
  private readonly events = ["progress", "agentStart", "agentEnd", "phase", "complete", "error", "paused", "stopped"];

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly manager: WorkflowManager,
    private readonly cwd: string,
    options: WorkflowRunBrowserOptions,
    private readonly done: (result: WorkflowBrowserExit) => void,
    private readonly notify: (message: string, level?: "info" | "warning" | "error") => void,
  ) {
    this.filter = options.initialFilter ?? "all";
    this.selectedRunId = options.initialRunId;
    this.screen = options.initialRunId ? "detail" : "runs";
    const selected = this.currentRun();
    if (selected) this.tab = selected.status === "completed" ? "result" : "progress";
    for (const event of this.events) this.manager.on(event, this.refresh);
  }

  dispose(): void {
    for (const event of this.events) this.manager.off(event, this.refresh);
  }

  invalidate(): void {}

  render(width: number): string[] {
    const height = Math.max(12, Math.floor((this.tui.terminal.rows || 24) * 0.8));
    if (this.screen === "runs") return this.renderRuns(width, height);
    if (this.screen === "agent") return this.renderAgent(width, height);
    return this.renderDetail(width, height);
  }

  handleInput(data: string): void {
    if (this.screen === "runs") return this.handleRunsInput(data);
    if (this.screen === "agent") return this.handleAgentInput(data);
    return this.handleDetailInput(data);
  }

  private readonly refresh = () => this.tui.requestRender();

  private runs(): PersistedRunState[] {
    const runs = this.manager.listAllRuns();
    if (this.filter === "active") return runs.filter((run) => run.status === "running" || run.status === "paused");
    if (this.filter === "completed") return runs.filter((run) => run.status === "completed");
    if (this.filter === "failed") return runs.filter((run) => run.status === "failed" || run.status === "aborted");
    return runs;
  }

  private currentRun(): PersistedRunState | undefined {
    const runs = this.manager.listAllRuns();
    const selected = runs.find((run) => run.runId === this.selectedRunId);
    if (this.screen !== "runs" && this.selectedRunId) return selected;
    return selected ?? this.runs()[0];
  }

  private renderRuns(width: number, height: number): string[] {
    const runs = this.runs();
    if (!runs.some((run) => run.runId === this.selectedRunId)) this.selectedRunId = runs[0]?.runId;
    const selectedIndex = Math.max(0, runs.findIndex((run) => run.runId === this.selectedRunId));
    const contentHeight = Math.max(4, height - 7);
    const start = Math.max(0, Math.min(selectedIndex - Math.floor(contentHeight / 2), runs.length - contentHeight));
    const visible = runs.slice(start, start + contentHeight);
    const allRuns = this.manager.listAllRuns();
    const active = allRuns.filter((run) => run.status === "running" || run.status === "paused").length;
    const lines = [
      this.theme.fg("accent", this.theme.bold(`Workflow runs · ${active} active · ${allRuns.length} total`)),
      this.theme.fg("muted", `Filter: ${this.filter}  (f cycles)`),
      "",
    ];
    if (!runs.length) {
      lines.push(this.theme.fg("muted", "No workflow runs in this view."));
    } else {
      for (const run of visible) {
        const selected = run.runId === this.selectedRunId;
        const marker = selected ? this.theme.fg("accent", "→") : " ";
        const status = statusLabel(this.theme, run.status);
        const done = `${run.snapshot.doneCount}/${run.snapshot.agentCount}`;
        const name = selected ? this.theme.fg("accent", run.workflowName) : run.workflowName;
        const usage = `${formatTokens(run.snapshot.tokens)} tok · $${run.snapshot.cost.toFixed(2)}`;
        lines.push(truncateToWidth(`${marker} ${status} ${name}  ${done} agents  ${usage}`, Math.max(10, width - 2)));
        if (selected) lines.push(this.theme.fg("dim", `    ${run.runId}`));
      }
    }
    while (lines.length < height - 3) lines.push("");
    lines.push(this.theme.fg("dim", "↑↓ select · enter inspect · f filter"));
    lines.push(this.theme.fg("dim", "n new · w saved · g setup · i settings · esc close"));
    return frame(this.theme, lines, width);
  }

  private renderDetail(width: number, height: number): string[] {
    const run = this.currentRun();
    if (!run) {
      this.screen = "runs";
      return this.renderRuns(width, height);
    }
    this.selectedRunId = run.runId;
    const innerWidth = Math.max(20, width - 4);
    const contentHeight = Math.max(3, height - 9);
    const tabs = TABS.map((tab) => tab === this.tab ? this.theme.fg("accent", `[${tab}]`) : this.theme.fg("muted", tab)).join("  ");
    const lines = [
      this.theme.fg("accent", this.theme.bold(run.workflowName)),
      truncateToWidth(formatWorkflowRunSummary(run), innerWidth),
      tabs,
      "",
    ];

    if (this.tab === "agents") {
      lines.push(...this.renderAgentList(run, innerWidth, contentHeight));
      this.totalLines = run.agents.length;
      this.viewHeight = contentHeight;
    } else {
      const markdown = new Markdown(this.tabMarkdown(run), 0, 0, getMarkdownTheme());
      const rendered = markdown.render(innerWidth);
      this.totalLines = rendered.length;
      this.viewHeight = contentHeight;
      this.clampScroll();
      lines.push(...rendered.slice(this.scrollOffset, this.scrollOffset + contentHeight));
    }
    while (lines.length < height - 3) lines.push("");
    const scroll = this.totalLines > this.viewHeight ? ` · ${this.scrollOffset + 1}-${Math.min(this.totalLines, this.scrollOffset + this.viewHeight)}/${this.totalLines}` : "";
    lines.push(this.theme.fg("dim", `←→/tab views · ↑↓ scroll · enter agent · esc back${scroll}`));
    lines.push(this.theme.fg("dim", "c copy · m Markdown · h HTML · o open HTML · s save workflow · p pause/resume · x stop"));
    return frame(this.theme, lines, width);
  }

  private renderAgent(width: number, height: number): string[] {
    const run = this.currentRun();
    const agent = this.selectedAgent;
    if (!run || !agent) {
      this.screen = "detail";
      return this.renderDetail(width, height);
    }
    const innerWidth = Math.max(20, width - 4);
    const contentHeight = Math.max(3, height - 6);
    const markdown = new Markdown(agentMarkdown(agent), 0, 0, getMarkdownTheme());
    const rendered = markdown.render(innerWidth);
    this.totalLines = rendered.length;
    this.viewHeight = contentHeight;
    this.clampScroll();
    const lines = [
      this.theme.fg("accent", this.theme.bold(`${agent.label} · ${agent.status}`)),
      this.theme.fg("muted", `${agent.phase ?? "No phase"} · ${agent.model ?? "model pending"} · ${formatTokens(agent.tokens ?? 0)} tok · $${(agent.cost ?? 0).toFixed(4)}`),
      "",
      ...rendered.slice(this.scrollOffset, this.scrollOffset + contentHeight),
    ];
    while (lines.length < height - 2) lines.push("");
    lines.push(this.theme.fg("dim", "↑↓/pgup/pgdn scroll · c copy result · esc agents"));
    return frame(this.theme, lines, width);
  }

  private renderAgentList(run: PersistedRunState, width: number, height: number): string[] {
    this.selectedAgentIndex = Math.min(this.selectedAgentIndex, Math.max(0, run.agents.length - 1));
    if (!run.agents.length) return [this.theme.fg("muted", "No agents have started yet.")];
    const start = Math.max(0, Math.min(this.selectedAgentIndex - Math.floor(height / 2), run.agents.length - height));
    return run.agents.slice(start, start + height).map((agent, offset) => {
      const index = start + offset;
      const marker = index === this.selectedAgentIndex ? this.theme.fg("accent", "→") : " ";
      const label = index === this.selectedAgentIndex ? this.theme.fg("accent", agent.label) : agent.label;
      return truncateToWidth(`${marker} ${statusLabel(this.theme, agent.status)} ${label}  ${agent.phase ?? ""}  ${formatTokens(agent.tokens ?? 0)} tok · $${(agent.cost ?? 0).toFixed(3)}`, width);
    });
  }

  private tabMarkdown(run: PersistedRunState): string {
    if (this.tab === "result") return workflowResultMarkdown(run);
    if (this.tab === "workflow") return `# Generated workflow\n\n\`\`\`javascript\n${run.script}\n\`\`\``;
    const phaseLines = run.snapshot.phases.length
      ? run.snapshot.phases.map((phase) => {
          const agents = run.agents.filter((agent) => agent.phase === phase);
          const done = agents.filter((agent) => agent.status === "done").length;
          const icon = phase === run.snapshot.currentPhase && run.status === "running" ? "◆" : done === agents.length && agents.length ? "✓" : "○";
          return `- ${icon} **${phase}** — ${done}/${agents.length} agents`;
        }).join("\n")
      : "_No phases declared._";
    const logs = run.snapshot.logs.length ? `\n\n## Recent activity\n\n${run.snapshot.logs.slice(-20).map((line) => `- ${line}`).join("\n")}` : "";
    return `# Progress\n\n${run.snapshot.description}\n\n${formatWorkflowRunSummary(run)}\n\n## Phases\n\n${phaseLines}${logs}${run.error ? `\n\n## Error\n\n${run.error}` : ""}`;
  }

  private handleRunsInput(data: string): void {
    if (isCancel(data)) return this.done(null);
    if (data === "n") return this.done("new");
    if (data === "w") return this.done("saved");
    if (data === "g") return this.done("setup");
    if (data === "i") return this.done("settings");
    if (data === "f") {
      this.filter = FILTERS[(FILTERS.indexOf(this.filter) + 1) % FILTERS.length] ?? "all";
      this.selectedRunId = this.runs()[0]?.runId;
      return this.refresh();
    }
    const runs = this.runs();
    if (!runs.length) return;
    let index = Math.max(0, runs.findIndex((run) => run.runId === this.selectedRunId));
    if (matchesKey(data, Key.up)) index = index === 0 ? runs.length - 1 : index - 1;
    else if (matchesKey(data, Key.down)) index = index === runs.length - 1 ? 0 : index + 1;
    else if (matchesKey(data, Key.enter)) {
      const run = runs[index];
      if (!run) return;
      this.selectedRunId = run.runId;
      this.tab = run.status === "completed" ? "result" : "progress";
      this.screen = "detail";
      this.scrollOffset = 0;
      return this.refresh();
    } else return;
    this.selectedRunId = runs[index]?.runId;
    this.refresh();
  }

  private handleDetailInput(data: string): void {
    const run = this.currentRun();
    if (!run) return;
    if (isCancel(data)) {
      this.screen = "runs";
      this.scrollOffset = 0;
      return this.refresh();
    }
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.right) || matchesKey(data, Key.left)) {
      const direction = matchesKey(data, Key.left) ? -1 : 1;
      const index = (TABS.indexOf(this.tab) + direction + TABS.length) % TABS.length;
      this.tab = TABS[index] ?? "result";
      this.scrollOffset = 0;
      return this.refresh();
    }
    if (this.tab === "agents" && (matchesKey(data, Key.up) || matchesKey(data, Key.down))) {
      if (!run.agents.length) return;
      this.selectedAgentIndex = matchesKey(data, Key.up)
        ? (this.selectedAgentIndex - 1 + run.agents.length) % run.agents.length
        : (this.selectedAgentIndex + 1) % run.agents.length;
      return this.refresh();
    }
    if (this.tab === "agents" && matchesKey(data, Key.enter)) {
      this.selectedAgent = run.agents[this.selectedAgentIndex];
      if (this.selectedAgent) {
        this.screen = "agent";
        this.scrollOffset = 0;
        return this.refresh();
      }
    }
    if (this.handleScroll(data)) return;
    if (data === "c") return void this.copy(workflowResultMarkdown(run), "Report copied.");
    if (data === "m") {
      const path = exportWorkflowReport(run, this.cwd, "markdown");
      this.notify(`Saved Markdown report to ${path}`);
      return;
    }
    if (data === "h") {
      const path = exportWorkflowReport(run, this.cwd, "html");
      this.notify(`Saved visual HTML report to ${path}`);
      return;
    }
    if (data === "o") {
      const path = exportWorkflowReport(run, this.cwd, "html");
      openLocalFile(path, (error) => this.notify(error ? `Could not open HTML: ${error}` : `Opened ${path}`, error ? "error" : "info"));
      return;
    }
    if (data === "s") {
      const path = saveWorkflowScript(run, this.cwd);
      this.notify(`Saved reusable workflow to ${path}`);
      return;
    }
    if (data === "p") {
      if (run.status === "running") this.notify(this.manager.pause(run.runId) ? `Paused ${run.workflowName}.` : "Could not pause this run.", "warning");
      else if (run.status === "paused") void this.manager.resume(run.runId).then((ok) => this.notify(ok ? `Resumed ${run.workflowName}.` : "Could not resume this run.", ok ? "info" : "warning"));
      return;
    }
    if (data === "x" && (run.status === "running" || run.status === "paused")) {
      this.notify(this.manager.stop(run.runId) ? `Stopped ${run.workflowName}.` : "Could not stop this run.", "warning");
    }
  }

  private handleAgentInput(data: string): void {
    if (isCancel(data)) {
      this.screen = "detail";
      this.tab = "agents";
      this.scrollOffset = 0;
      return this.refresh();
    }
    if (this.handleScroll(data)) return;
    if (data === "c" && this.selectedAgent) void this.copy(resultText(this.selectedAgent.result), "Agent result copied.");
  }

  private handleScroll(data: string): boolean {
    let delta = 0;
    if (matchesKey(data, Key.up)) delta = -1;
    else if (matchesKey(data, Key.down)) delta = 1;
    else if (matchesKey(data, Key.pageUp)) delta = -this.viewHeight;
    else if (matchesKey(data, Key.pageDown)) delta = this.viewHeight;
    else return false;
    this.scrollOffset += delta;
    this.clampScroll();
    this.refresh();
    return true;
  }

  private clampScroll(): void {
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, Math.max(0, this.totalLines - this.viewHeight)));
  }

  private copy(text: string, message: string): void {
    void copyToClipboard(text).then(() => this.notify(message)).catch((error) => this.notify(`Copy failed: ${String(error)}`, "error"));
  }
}

function agentMarkdown(agent: WorkflowAgentSnapshot): string {
  const prompt = agent.prompt?.trim() || "_Prompt was not captured for this older run._";
  const activity = agent.activity?.length
    ? agent.activity.map((item) => `- **${item.type === "tool_call" ? "Call" : "Result"}: ${item.name}${item.isError ? " (error)" : ""}${item.summary ? ` — ${item.summary.replace(/\n/g, " ")}` : ""}`).join("\n")
    : "_No tool activity was captured._";
  return `# Prompt\n\n${prompt}\n\n# Recent tool activity\n\n${activity}\n\n# Result\n\n${resultText(agent.result) || "_No result yet._"}${agent.error ? `\n\n# Error\n\n${agent.error}` : ""}`;
}

function workflowReportFile(run: PersistedRunState): string {
  return `# ${run.workflowName}\n\n${formatWorkflowRunSummary(run)}\n\nRun ID: \`${run.runId}\`\n\n---\n\n${workflowResultMarkdown(run)}\n`;
}

function workflowReportHtml(run: PersistedRunState): string {
  const agents = run.agents.map((agent) => `<details><summary>${escapeHtml(agent.label)} <span>${escapeHtml(agent.status)} · ${formatTokens(agent.tokens ?? 0)} tok · $${(agent.cost ?? 0).toFixed(4)}</span></summary><h3>Prompt</h3><pre>${escapeHtml(agent.prompt ?? "Prompt was not captured for this older run.")}</pre><h3>Result</h3><div class="agent-result">${simpleMarkdown(resultText(agent.result))}</div></details>`).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(run.workflowName)}</title><style>
:root{color-scheme:dark;--bg:#0b1017;--panel:#121a24;--line:#263244;--text:#e7edf5;--muted:#91a0b4;--accent:#67e8f9;--ok:#86efac}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#123044 0,transparent 35%),var(--bg);color:var(--text);font:15px/1.65 Inter,ui-sans-serif,system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:48px 24px 80px}header{border-bottom:1px solid var(--line);padding-bottom:24px}h1{font-size:clamp(30px,5vw,54px);line-height:1.05;margin:8px 0}.eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.16em;font-size:12px}.runid{color:var(--muted);font-family:ui-monospace,monospace}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:26px 0}.metric{background:color-mix(in srgb,var(--panel) 88%,transparent);border:1px solid var(--line);border-radius:14px;padding:16px}.metric strong{display:block;font-size:22px}.metric span,summary span{color:var(--muted);font-size:13px}.layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:28px;margin-top:32px}.report,.agents{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:clamp(20px,4vw,38px)}.report h1,.report h2,.report h3{line-height:1.2;margin-top:1.5em}.report h1{font-size:30px}.report h2{font-size:23px;color:var(--accent)}code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}code{background:#081019;border:1px solid var(--line);border-radius:5px;padding:.1em .35em}pre{white-space:pre-wrap;overflow:auto;background:#081019;border:1px solid var(--line);border-radius:10px;padding:14px}.report table{width:100%;border-collapse:collapse}.report th,.report td{border:1px solid var(--line);padding:8px;text-align:left}.report a{color:var(--accent)}details{border-top:1px solid var(--line);padding:12px 0}summary{cursor:pointer;font-weight:650}.agent-result{font-size:13px}.agents h2{margin-top:0}@media(max-width:850px){.layout{grid-template-columns:1fr}}
</style></head><body><main><header><div class="eyebrow">Pi workflow report</div><h1>${escapeHtml(run.workflowName)}</h1><div class="runid">${escapeHtml(run.runId)}</div><div class="metrics"><div class="metric"><strong>${escapeHtml(run.status)}</strong><span>Status</span></div><div class="metric"><strong>${run.snapshot.doneCount}/${run.snapshot.agentCount}</strong><span>Agents</span></div><div class="metric"><strong>${formatTokens(run.snapshot.tokens)}</strong><span>Tokens</span></div><div class="metric"><strong>$${run.snapshot.cost.toFixed(4)}</strong><span>Cost</span></div><div class="metric"><strong>${formatDuration(run.result?.durationMs ?? run.snapshot.durationMs ?? elapsedMs(run.startedAt, run.updatedAt))}</strong><span>Duration</span></div></div></header><div class="layout"><article class="report">${simpleMarkdown(workflowResultMarkdown(run))}</article><aside class="agents"><h2>Agent evidence</h2>${agents || "<p>No agents recorded.</p>"}<details><summary>Generated workflow</summary><pre>${escapeHtml(run.script)}</pre></details></aside></div></main></body></html>\n`;
}

function simpleMarkdown(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: "ul" | "ol" | undefined;
  let code = false;
  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = undefined;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (/^```/.test(line)) {
      flushParagraph(); closeList();
      html.push(code ? "</code></pre>" : "<pre><code>");
      code = !code;
      continue;
    }
    if (code) { html.push(`${escapeHtml(line)}\n`); continue; }
    if (isTableRow(line) && isTableSeparator(lines[index + 1] ?? "")) {
      flushParagraph(); closeList();
      const headers = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index] ?? "")) {
        rows.push(tableCells(lines[index] ?? ""));
        index += 1;
      }
      index -= 1;
      html.push(`<table><thead><tr>${headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_header, cellIndex) => `<td>${inlineMarkdown(row[cellIndex] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { flushParagraph(); closeList(); const level = heading[1]?.length ?? 1; html.push(`<h${level}>${inlineMarkdown(heading[2] ?? "")}</h${level}>`); continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flushParagraph(); closeList(); html.push("<hr>"); continue; }
    const item = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
    if (item) { flushParagraph(); const nextList = item[1]?.endsWith(".") ? "ol" : "ul"; if (list !== nextList) { closeList(); list = nextList; html.push(`<${list}>`); } html.push(`<li>${inlineMarkdown(item[2] ?? "")}</li>`); continue; }
    if (line.startsWith("> ")) { flushParagraph(); closeList(); html.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`); continue; }
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    paragraph.push(line.trim());
  }
  flushParagraph(); closeList(); if (code) html.push("</code></pre>");
  return html.join("\n");
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>');
}

function isTableRow(line: string): boolean {
  return line.includes("|") && tableCells(line).length > 1;
}

function isTableSeparator(line: string): boolean {
  const cells = tableCells(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function openLocalFile(path: string, callback: (error?: string) => void): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  const child = spawn(command, [path], { detached: true, stdio: "ignore" });
  let settled = false;
  child.once("error", (error) => {
    settled = true;
    callback(error.message);
  });
  child.once("spawn", () => {
    child.unref();
    if (!settled) callback();
  });
}

function workflowExportsDir(cwd: string): string {
  const key = createHash("sha256").update(cwd).digest("hex").slice(0, 16);
  return join(homedir(), ".pi", "workflows", "projects", key, "exports");
}

function resultText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function elapsedMs(start: string, end: string): number {
  return Math.max(0, Date.parse(end) - Date.parse(start));
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(tokens >= 100_000 ? 0 : 1)}K`;
  return String(tokens);
}

function statusLabel(theme: Theme, status: string): string {
  if (status === "completed" || status === "done") return theme.fg("success", "✓");
  if (status === "running") return theme.fg("accent", "◆");
  if (status === "paused") return theme.fg("warning", "Ⅱ");
  if (status === "queued") return theme.fg("muted", "○");
  return theme.fg("error", "✗");
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

function isCancel(data: string): boolean {
  return matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || data === "q";
}

function safeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
