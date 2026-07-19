import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import {
  exportWorkflowReport,
  formatWorkflowRunSummary,
  saveWorkflowScript,
  WorkflowRunBrowser,
  workflowResultMarkdown,
} from "../../extensions/workflow/run-browser.js";
import { deliverText, type ManagedRun, type PersistedRunState, WorkflowManager } from "../../extensions/workflow/runtime.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function completedRun(report = "# Final report\n\nUseful evidence."): PersistedRunState {
  return {
    runId: "research-run-abc123",
    workflowName: "research-run",
    status: "completed",
    script: 'export const meta = { name: "research-run", description: "Research" };\nreturn agent("work");',
    journal: [],
    startedAt: "2026-07-18T18:00:00.000Z",
    updatedAt: "2026-07-18T18:05:30.000Z",
    snapshot: {
      name: "research-run",
      description: "Research",
      phases: ["Research", "Synthesize"],
      currentPhase: "Synthesize",
      logs: ["phase: Research", "phase: Synthesize"],
      agents: [],
      agentCount: 1,
      runningCount: 0,
      doneCount: 1,
      errorCount: 0,
      tokens: 2_282_261,
      cost: 1.9386,
      durationMs: 330_000,
      result: { report, supportingFindings: ["one"] },
    },
    agents: [
      {
        id: 1,
        label: "synth",
        status: "done",
        phase: "Synthesize",
        prompt: "Synthesize the evidence.",
        model: "test/model:medium",
        result: report,
        tokens: 2_282_261,
        cost: 1.9386,
        activity: [{ type: "tool_call", name: "read", summary: '{"path":"README.md"}' }],
      },
    ],
    result: {
      meta: { name: "research-run", description: "Research" },
      result: { report, supportingFindings: ["one"] },
      agentCount: 1,
      durationMs: 330_000,
      tokens: 2_282_261,
      cost: 1.9386,
      journal: [],
    },
  };
}

describe("workflow run browser", () => {
  it("renders the primary Markdown report and visible usage instead of escaped JSON", () => {
    const run = completedRun();
    assert.equal(workflowResultMarkdown(run), "# Final report\n\nUseful evidence.");
    assert.match(formatWorkflowRunSummary(run), /2\.28M/);
    assert.match(formatWorkflowRunSummary(run), /\$1\.9386/);

    const delivery = deliverText({ ...run, controller: new AbortController(), background: true } as ManagedRun);
    assert.match(delivery, /# Final report/);
    assert.doesNotMatch(delivery, /\\n/);
    assert.match(delivery, new RegExp(`/workflow status ${run.runId}`));
  });

  it("does not truncate a long completed report", () => {
    const report = `# Long report\n\n${"evidence ".repeat(2_000)}`;
    const run = completedRun(report);
    assert.equal(workflowResultMarkdown(run).length, report.length);
    assert.equal(deliverText({ ...run, controller: new AbortController(), background: true } as ManagedRun).includes(report), true);
  });

  it("exports durable Markdown and self-contained visual HTML", () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-export-"));
    roots.push(root);
    const run = completedRun("# Report\n\n<script>alert('no')</script>\n\n| Check | Result |\n| --- | --- |\n| Sources | Verified |\n\n**Verified.**");
    const markdownPath = exportWorkflowReport(run, root, "markdown", join(root, "exports"));
    const htmlPath = exportWorkflowReport(run, root, "html", join(root, "exports"));
    const markdown = readFileSync(markdownPath, "utf8");
    const html = readFileSync(htmlPath, "utf8");

    assert.match(markdown, /# Report/);
    assert.match(markdown, /2\.28M/);
    assert.match(html, /Pi workflow report/);
    assert.match(html, /Agent evidence/);
    assert.match(html, /<table>/);
    assert.match(html, /<td>Verified<\/td>/);
    assert.match(html, /Synthesize the evidence/);
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;alert/);
  });

  it("saves a reusable script without overwriting a different workflow", () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-script-"));
    roots.push(root);
    const first = completedRun();
    const firstPath = saveWorkflowScript(first, root);
    const secondPath = saveWorkflowScript({ ...first, script: `${first.script}\n// changed` }, root);
    assert.equal(firstPath.endsWith("research-run.js"), true);
    assert.notEqual(secondPath, firstPath);
    assert.equal(readFileSync(firstPath, "utf8").includes("// changed"), false);
  });

  it("opens a completed run directly into its full result view", async () => {
    initTheme(undefined, false);
    const root = mkdtempSync(join(tmpdir(), "workflow-browser-"));
    roots.push(root);
    const manager = new WorkflowManager({
      cwd: root,
      runsDir: join(root, "runs"),
      agent: async (prompt) => ({ output: `# Result\n\n${prompt}`, model: "test/model:low", tokens: 25, cost: 0.01 }),
    });
    await manager.runSync(`export const meta = { name: "browser", description: "Browser test", phases: ["Inspect"] };
phase("Inspect");
const report = await agent("inspect this", { label: "inspector", tier: "worker" });
return { report };`);
    const run = manager.listRuns()[0];
    assert.ok(run);
    manager.setSessionId("a-new-pi-session");
    assert.equal(manager.listRuns().length, 0, "the session-scoped task list should be empty");
    assert.equal(manager.listAllRuns().length, 1, "project history must survive a new Pi session");

    const renders: string[][] = [];
    const tui = { terminal: { rows: 30 }, requestRender() {} } as any;
    const theme = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
    } as any;
    const browser = new WorkflowRunBrowser(tui, theme, manager, root, {}, () => {}, () => {});
    renders.push(browser.render(120));
    assert.match(renders[0]?.join("\n") ?? "", /1 total/);
    browser.handleInput("\r");
    const resultView = browser.render(120).join("\n");
    assert.match(resultView, /# Result|Result/);
    assert.match(resultView, /Tokens: 25/);
    browser.handleInput("\t");
    browser.handleInput("\t");
    browser.handleInput("\r");
    const agentDetail = browser.render(120).join("\n");
    assert.match(agentDetail, /Prompt/);
    assert.match(agentDetail, /inspect this/);
    browser.dispose();
  });
});
