import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  loadWorkflowControlSettings,
  profileLimits,
  saveWorkflowControlSettings,
} from "../../extensions/workflow/config.js";
import type { WorkflowControlSettings } from "../../extensions/workflow/types.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function settings(profile: WorkflowControlSettings["profile"] = "balanced"): WorkflowControlSettings {
  return {
    version: 1,
    profile,
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
}

describe("workflow control settings", () => {
  it("saves and loads global settings", () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-config-"));
    roots.push(root);
    const paths = { globalPath: join(root, "global.json"), projectPath: join(root, "project.json") };
    saveWorkflowControlSettings(settings(), root, "global", paths);
    assert.deepEqual(loadWorkflowControlSettings(root, paths), settings());
  });

  it("lets a valid project profile override the global profile", () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-config-"));
    roots.push(root);
    const paths = { globalPath: join(root, "global.json"), projectPath: join(root, "project.json") };
    saveWorkflowControlSettings(settings("balanced"), root, "global", paths);
    saveWorkflowControlSettings({ ...settings("lean"), concurrency: 3, maxAgents: 8 }, root, "project", paths);
    assert.equal(loadWorkflowControlSettings(root, paths)?.profile, "lean");
  });

  it("ignores corrupt and incomplete settings", () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-config-"));
    roots.push(root);
    const globalPath = join(root, "global.json");
    mkdirSync(root, { recursive: true });
    writeFileSync(globalPath, JSON.stringify({ profile: "balanced", routes: {} }));
    assert.equal(loadWorkflowControlSettings(root, { globalPath, projectPath: join(root, "missing") }), undefined);
  });

  it("defines the intended preset limits", () => {
    assert.deepEqual(profileLimits("lean"), { concurrency: 3, maxAgents: 8 });
    assert.deepEqual(profileLimits("balanced"), { concurrency: 4, maxAgents: 15 });
    assert.deepEqual(profileLimits("deep"), { concurrency: 6, maxAgents: 40 });
  });
});
