import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { discoverWorkflowFiles, loadWorkflowFile } from "../../extensions/workflow/discovery.js";
import { createWorkflowPreview, applyWorkflowLimits, formatWorkflowApproval } from "../../extensions/workflow/preview.js";
import type { WorkflowControlSettings } from "../../extensions/workflow/types.js";

const roots: string[] = [];
const script = `export const meta = {
  name: "review",
  description: "Review the change",
  phases: [{ title: "Inspect" }, { title: "Synthesize" }]
};
const result = await agent("inspect", { label: "inspector", tier: "reviewer", tools: ["read", "bash"], model: "other/reviewer" });
return { result };
`;
const settings: WorkflowControlSettings = {
  version: 1,
  profile: "balanced",
  concurrency: 4,
  maxAgents: 15,
  approvalMode: "always",
  routes: {
    scout: { model: "provider/small", thinking: "low" },
    worker: { model: "provider/medium", thinking: "medium" },
    reviewer: { model: "other/reviewer", thinking: "high" },
    synthesizer: { model: "provider/large", thinking: "high" },
  },
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("saved workflow discovery", () => {
  it("ships parseable built-in workflows", () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-builtins-"));
    roots.push(root);
    const projectDir = join(root, "project");
    const userDir = join(root, "user");
    mkdirSync(projectDir);
    mkdirSync(userDir);
    const workflows = discoverWorkflowFiles(root, { projectDir, userDir });
    assert.deepEqual(
      workflows.filter((workflow) => workflow.location === "built-in").map((workflow) => workflow.id),
      ["code-review", "migration-plan", "repository-audit"],
    );
  });

  it("discovers plain JavaScript and lets project files override user files", () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-discovery-"));
    roots.push(root);
    const projectDir = join(root, "project");
    const userDir = join(root, "user");
    mkdirSync(projectDir);
    mkdirSync(userDir);
    writeFileSync(join(userDir, "review.js"), script.replace("Review the change", "User review"));
    writeFileSync(join(projectDir, "review.js"), script.replace("Review the change", "Project review"));
    writeFileSync(join(projectDir, "broken.js"), "not javascript");

    const options = { projectDir, userDir, builtInDir: null };
    const workflows = discoverWorkflowFiles(root, options);
    assert.equal(workflows.length, 1);
    assert.equal(workflows[0].description, "Project review");
    assert.equal(loadWorkflowFile(root, "review", options)?.location, "project");
  });
});

describe("workflow approval preview", () => {
  it("shows phases, routes, explicit models, tools, and bounded scale", () => {
    const limited = applyWorkflowLimits({ script, maxAgents: 100, concurrency: 12 }, settings);
    assert.equal(limited.maxAgents, 15);
    assert.equal(limited.concurrency, 4);
    const preview = createWorkflowPreview(script, settings, "generated", limited);
    assert.deepEqual(preview.phases, ["Inspect", "Synthesize"]);
    assert.deepEqual(preview.explicitModels, ["other/reviewer"]);
    assert.deepEqual(preview.explicitTools, ["read", "bash"]);
    assert.match(formatWorkflowApproval(preview), /not a security sandbox/);
  });
});
