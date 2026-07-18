import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterWorkflowModels, WorkflowModelSelector } from "../../extensions/workflow/model-selector.js";
import type { WorkflowModelCandidate } from "../../extensions/workflow/types.js";

const models: WorkflowModelCandidate[] = [
  { spec: "openrouter/anthropic/claude-opus", provider: "openrouter", name: "Claude Opus", costOutput: 10, contextWindow: 200_000 },
  { spec: "openrouter/google/gemini-flash", provider: "openrouter", name: "Gemini Flash", costOutput: 1, contextWindow: 1_000_000 },
  { spec: "openai/gpt-5.5", provider: "openai", name: "GPT 5.5", costOutput: 8, contextWindow: 400_000 },
];

describe("workflow model picker", () => {
  it("filters by provider, model id, and display name like Pi's /model selector", () => {
    assert.deepEqual(filterWorkflowModels(models, "gemini").map((model) => model.spec), [
      "openrouter/google/gemini-flash",
    ]);
    assert.deepEqual(filterWorkflowModels(models, "openai 5.5").map((model) => model.spec), [
      "openai/gpt-5.5",
    ]);
    assert.equal(filterWorkflowModels(models, "").length, 3);
  });

  it("renders a bounded searchable viewport instead of the full provider catalog", () => {
    const catalog = Array.from({ length: 30 }, (_, index): WorkflowModelCandidate => ({
      spec: `provider/model-${index}`,
      provider: "provider",
      name: `Model ${index}`,
      costOutput: index,
      contextWindow: 100_000,
    }));
    const selector = new WorkflowModelSelector(
      { requestRender() {} } as any,
      { fg: (_color: string, value: string) => value } as any,
      "Scout model",
      catalog,
      "provider/model-15",
      () => {},
      () => {},
    );
    const rendered = selector.render(100).join("\n");
    assert.match(rendered, /Scout model/);
    assert.match(rendered, /Type to filter models/);
    assert.equal((rendered.match(/provider\/model-/g) ?? []).length, 9);
    assert.match(rendered, /16\/30/);
  });
});
