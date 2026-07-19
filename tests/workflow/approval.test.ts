import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorkflowApprovalView } from "../../extensions/workflow/approval.js";
import type { WorkflowPreview } from "../../extensions/workflow/types.js";

const script = `export const meta = {
  name: "visible-plan",
  description: "Show the code before approval",
  phases: [{ title: "Inspect" }]
};
phase("Inspect");
return await agent("Inspect the repository.", { label: "inspector", tier: "scout" });`;

const preview: WorkflowPreview = {
  name: "visible-plan",
  description: "Show the code before approval",
  script,
  phases: ["Inspect"],
  staticAgentCalls: 1,
  explicitModels: [],
  explicitTools: [],
  profile: "lean",
  concurrency: 3,
  maxAgents: 8,
  source: "generated",
  routes: {
    scout: { model: "test/small", thinking: "low" },
    worker: { model: "test/medium", thinking: "medium" },
    reviewer: { model: "test/reviewer", thinking: "medium" },
    synthesizer: { model: "test/large", thinking: "high" },
  },
};

describe("workflow approval view", () => {
  it("shows the actual JavaScript by default and requires an explicit y approval", () => {
    let approved: boolean | undefined;
    const tui = { terminal: { rows: 36 }, requestRender() {} } as any;
    const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as any;
    const view = new WorkflowApprovalView(tui, theme, preview, (result) => { approved = result; });
    const rendered = view.render(110).join("\n");

    assert.match(rendered, /\[JavaScript\]/);
    assert.match(rendered, /return await agent/);
    assert.match(rendered, /y approve and run/);
    assert.equal(approved, undefined);
    view.handleInput("y");
    assert.equal(approved, true);
  });

  it("lets the user switch to the route and security summary or reject", () => {
    let approved: boolean | undefined;
    const tui = { terminal: { rows: 36 }, requestRender() {} } as any;
    const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as any;
    const view = new WorkflowApprovalView(tui, theme, preview, (result) => { approved = result; });
    view.handleInput("\t");
    const rendered = view.render(110).join("\n");
    assert.match(rendered, /Profile: lean/);
    assert.match(rendered, /not [\s│]*a security sandbox/);
    view.handleInput("n");
    assert.equal(approved, false);
  });
});
