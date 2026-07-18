import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rankModels,
  suggestWorkflowSettings,
  toModelTierConfig,
  workflowRoleGuideline,
} from "../../extensions/workflow/profiles.js";
import type { WorkflowModelCandidate } from "../../extensions/workflow/types.js";

const models: WorkflowModelCandidate[] = [
  { spec: "anthropic/haiku", provider: "anthropic", name: "Haiku", costOutput: 1, contextWindow: 200_000 },
  { spec: "openai/gpt-mid", provider: "openai", name: "GPT Mid", costOutput: 5, contextWindow: 128_000 },
  { spec: "anthropic/opus", provider: "anthropic", name: "Opus", costOutput: 20, contextWindow: 200_000 },
];

describe("workflow model profiles", () => {
  it("ranks priced models from inexpensive to expensive", () => {
    assert.deepEqual(rankModels(models).map((model) => model.spec), [
      "anthropic/haiku",
      "openai/gpt-mid",
      "anthropic/opus",
    ]);
  });

  it("builds a balanced role map with a cross-provider reviewer", () => {
    const settings = suggestWorkflowSettings("balanced", models, "anthropic/opus");
    assert.equal(settings.routes.scout.model, "anthropic/haiku");
    assert.equal(settings.routes.worker.model, "anthropic/opus");
    assert.equal(settings.routes.reviewer.model, "openai/gpt-mid");
    assert.equal(settings.concurrency, 4);
    assert.equal(settings.maxAgents, 15);
  });

  it("compiles semantic roles and compatibility aliases into runtime tiers", () => {
    const settings = suggestWorkflowSettings("lean", models, "openai/gpt-mid");
    const config = toModelTierConfig(settings);
    assert.equal(config.tiers.small, config.tiers.scout);
    assert.equal(config.tiers.medium, config.tiers.worker);
    assert.equal(config.tiers.big, config.tiers.synthesizer);
    assert.match(workflowRoleGuideline(settings), /tier: 'reviewer'/);
  });
});
