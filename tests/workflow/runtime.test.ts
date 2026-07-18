import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { parseWorkflowScript, WorkflowManager } from "../../extensions/workflow/runtime.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const workflowScript = `export const meta = {
  name: "parallel_review",
  description: "Run two checks and synthesize",
  phases: [{ title: "Inspect" }, { title: "Synthesize" }]
};
phase("Inspect");
const findings = await parallel([
  () => agent("check a", { label: "check a", tier: "scout" }),
  () => agent("check b", { label: "check b", tier: "worker" })
]);
phase("Synthesize");
const summary = await agent("summarize " + findings.join(","), { label: "summary", tier: "synthesizer" });
return { findings, summary };
`;

describe("workflow runtime", () => {
  it("parses literal metadata without evaluating it", () => {
    const parsed = parseWorkflowScript(workflowScript);
    assert.equal(parsed.meta.name, "parallel_review");
    assert.deepEqual(parsed.meta.phases?.map((phase) => phase.title), ["Inspect", "Synthesize"]);
    assert.doesNotMatch(parsed.body, /export const meta/);
    assert.throws(
      () => parseWorkflowScript("export const meta = makeMeta(); return null;"),
      /literal|object/,
    );
  });

  it("normalizes generated string phases and an exported run wrapper", async () => {
    const generated = `export const meta = {
  name: "generated_shape",
  description: "Shape emitted by a model",
  phases: ["inspect", "synthesize"]
};
export default async function run() {
  phase("inspect");
  const finding = await agent("inspect", { label: "inspect", tier: "scout" });
  return { finding };
}`;
    const parsed = parseWorkflowScript(generated);
    assert.deepEqual(parsed.meta.phases?.map((phase) => phase.title), ["inspect", "synthesize"]);
    assert.doesNotMatch(parsed.body, /export default/);

    const root = mkdtempSync(join(tmpdir(), "workflow-generated-"));
    roots.push(root);
    const manager = new WorkflowManager({
      cwd: root,
      runsDir: join(root, "runs"),
      agent: async (prompt) => ({ output: `done:${prompt}`, model: "test/model:low", tokens: 1, cost: 0 }),
    });
    const result = await manager.runSync(generated);
    assert.equal(JSON.stringify(result.result), JSON.stringify({ finding: "done:inspect" }));
  });

  it("executes fan-out/fan-in, persists history, and records usage", async () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-runtime-"));
    roots.push(root);
    const manager = new WorkflowManager({
      cwd: root,
      runsDir: join(root, "runs"),
      agent: async (prompt) => ({
        output: `done:${prompt}`,
        model: "test/model:low",
        tokens: 10,
        cost: 0.01,
        activity: [{ type: "tool_call" as const, name: "read", summary: "README.md" }],
      }),
    });
    const result = await manager.runSync(workflowScript, undefined, { concurrency: 2, maxAgents: 5 });
    assert.equal(result.agentCount, 3);
    assert.equal(result.tokens, 30);
    assert.equal(result.cost, 0.03);
    assert.deepEqual((result.result as any).findings, ["done:check a", "done:check b"]);
    assert.equal(manager.listRuns()[0].status, "completed");
    assert.equal(manager.listRuns()[0].agents[0]?.prompt, "check a");
    assert.deepEqual(manager.listRuns()[0].agents[0]?.activity, [
      { type: "tool_call", name: "read", summary: "README.md" },
    ]);
  });

  it("enforces the configured total-agent cap", async () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-runtime-"));
    roots.push(root);
    const manager = new WorkflowManager({
      cwd: root,
      runsDir: join(root, "runs"),
      agent: async (prompt) => ({ output: prompt, model: "test/model:low", tokens: 1, cost: 0 }),
    });
    await assert.rejects(manager.runSync(workflowScript, undefined, { maxAgents: 2 }), /2-agent cap/);
    assert.equal(manager.listRuns()[0].status, "failed");
  });

  it("rejects orchestration with no agents or a non-serializable result", async () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-runtime-"));
    roots.push(root);
    const manager = new WorkflowManager({
      cwd: root,
      runsDir: join(root, "runs"),
      agent: async (prompt) => ({ output: prompt, model: "test/model:low", tokens: 1, cost: 0 }),
    });
    await assert.rejects(
      manager.runSync('export const meta = { name: "empty", description: "empty" }; return {};'),
      /must call agent/,
    );
    await assert.rejects(
      manager.runSync(`export const meta = { name: "circular", description: "circular" };
await agent("work", { label: "work", tier: "worker" });
const result = {}; result.self = result; return result;`),
      /JSON-serializable/,
    );
  });

  it("rejects traversal-shaped run IDs", () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-runtime-"));
    roots.push(root);
    const runsDir = join(root, "runs");
    const victim = join(root, "victim.json");
    writeFileSync(victim, "keep");
    const manager = new WorkflowManager({ cwd: root, runsDir });
    assert.equal(manager.deleteRun("../../victim"), false);
    assert.equal(existsSync(victim), true);
  });

  it("resumes a paused run from its unchanged journal prefix", async () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-runtime-"));
    roots.push(root);
    let calls = 0;
    let releaseSecond: (() => void) | undefined;
    const secondStarted = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    let unblock: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const manager = new WorkflowManager({
      cwd: root,
      runsDir: join(root, "runs"),
      agent: async (prompt) => {
        calls++;
        if (calls === 2) {
          releaseSecond?.();
          await blocked;
        }
        return { output: `done:${prompt}`, model: "test/model:low", tokens: 1, cost: 0 };
      },
    });
    const sequential = `export const meta = { name: "resume", description: "resume test" };
const first = await agent("first", { label: "first", tier: "worker" });
const second = await agent("second", { label: "second", tier: "worker" });
return { first, second };
`;
    const { runId, promise } = manager.startInBackground(sequential);
    await secondStarted;
    assert.equal(manager.pause(runId), true);
    unblock?.();
    await assert.rejects(promise, /paused/);
    assert.equal(manager.listRuns()[0].journal.length, 1);

    const completed = new Promise<void>((resolve) => manager.once("complete", () => resolve()));
    assert.equal(await manager.resume(runId), true);
    await completed;
    assert.equal(calls, 3, "the first agent should replay from cache during resume");
    assert.equal(manager.listRuns()[0].status, "completed");
  });
});
