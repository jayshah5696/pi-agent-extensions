import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { WorkflowManager } from "../../extensions/workflow/runtime.js";
import { installWorkflowResultDelivery } from "../../extensions/workflow/ui.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function harness() {
  const root = mkdtempSync(join(tmpdir(), "workflow-delivery-"));
  roots.push(root);
  const manager = new WorkflowManager({
    cwd: root,
    runsDir: join(root, "runs"),
    agent: async (prompt) => ({ output: `done:${prompt}`, model: "test/model:low", tokens: 1, cost: 0 }),
  });
  const messages: Array<{ content: string; options: unknown }> = [];
  const pi = {
    sendMessage(message: { content: string }, options: unknown) {
      messages.push({ content: message.content, options });
    },
  } as any;
  installWorkflowResultDelivery(pi, manager);
  return { manager, messages };
}

describe("workflow result delivery", () => {
  it("displays completion without waking the parent model for another tool turn", async () => {
    const { manager, messages } = harness();
    const { promise } = manager.startInBackground(`export const meta = { name: "complete", description: "Complete once" };
return await agent("work", { label: "worker", tier: "worker" });`);
    await promise;
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0]?.options, { triggerTurn: false });
    assert.match(messages[0]?.content ?? "", /finished/);
  });

  it("displays failure once without triggering an automatic retry and approval loop", async () => {
    const { manager, messages } = harness();
    const { promise } = manager.startInBackground(`export const meta = { name: "fail", description: "Fail once" };
await agent("work", { label: "worker", tier: "worker" });
throw new Error("deliberate failure");`);
    await assert.rejects(promise, /deliberate failure/);
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0]?.options, { triggerTurn: false });
    assert.match(messages[0]?.content ?? "", /failed: deliberate failure/);
  });
});
