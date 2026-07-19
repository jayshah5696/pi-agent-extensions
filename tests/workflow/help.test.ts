import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatWorkflowDoctor, formatWorkflowHelp } from "../../extensions/workflow/help.js";
import type { WorkflowControlSettings } from "../../extensions/workflow/types.js";

const settings: WorkflowControlSettings = {
  version: 1,
  profile: "lean",
  concurrency: 3,
  maxAgents: 8,
  approvalMode: "always",
  routes: {
    scout: { model: "test/scout", thinking: "low" },
    worker: { model: "test/worker", thinking: "medium" },
    reviewer: { model: "test/reviewer", thinking: "medium" },
    synthesizer: { model: "test/synthesizer", thinking: "high" },
  },
};

describe("workflow user guidance", () => {
  it("explains the complete setup, approval, inspection, and verification path", () => {
    const help = formatWorkflowHelp();
    assert.match(help, /\/workflow setup/);
    assert.match(help, /complete JavaScript approval screen/);
    assert.match(help, /y runs · n\/Esc rejects/);
    assert.match(help, /\/workflow history/);
    assert.match(help, /\/workflow doctor.*no model calls/);
    assert.match(help, /will not retry or ask for approval again/);
  });

  it("reports a ready installation and states that verification is side-effect free", () => {
    const report = formatWorkflowDoctor({
      extensionActive: true,
      projectTrusted: true,
      settings,
      availableModels: 4,
      missingRoles: [],
      savedWorkflows: 3,
      runHistory: 2,
    });
    assert.match(report, /✓ Workflow extension is active/);
    assert.match(report, /✓ All 4 model routes are available/);
    assert.match(report, /Ready\. Try:/);
    assert.match(report, /made no model calls, changed no settings, and started no workflows/);
  });

  it("gives a concrete recovery step when trust or model routes are missing", () => {
    const untrusted = formatWorkflowDoctor({
      extensionActive: true,
      projectTrusted: false,
      settings,
      availableModels: 4,
      missingRoles: [],
      savedWorkflows: 3,
      runHistory: 0,
    });
    assert.match(untrusted, /restart Pi with --approve/i);

    const missing = formatWorkflowDoctor({
      extensionActive: true,
      projectTrusted: true,
      settings,
      availableModels: 3,
      missingRoles: ["reviewer"],
      savedWorkflows: 3,
      runHistory: 0,
    });
    assert.match(missing, /Unavailable model routes: reviewer/);
    assert.match(missing, /Run \/workflow setup again/);
  });
});
