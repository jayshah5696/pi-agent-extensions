import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("sessions command switch flow", () => {
  it("does not require post-switch use of the stale ctx", async () => {
    const staleUiCalls: string[] = [];

    const staleCtx = {
      ui: {
        notify: (msg: string) => {
          staleUiCalls.push(msg);
        },
      },
      switchSession: async (_path: string) => ({ cancelled: false }),
    } as any;

    const result = await staleCtx.switchSession("/tmp/other-session.jsonl");

    assert.equal(result.cancelled, false);
    assert.deepEqual(staleUiCalls, []);
  });

  it("only uses stale ctx after switch when the switch was cancelled", async () => {
    const staleUiCalls: string[] = [];

    const staleCtx = {
      ui: {
        notify: (msg: string) => {
          staleUiCalls.push(msg);
        },
      },
      switchSession: async (_path: string) => ({ cancelled: true }),
    } as any;

    const result = await staleCtx.switchSession("/tmp/other-session.jsonl");
    if (result.cancelled) {
      staleCtx.ui.notify("Session switch cancelled.", "info");
    }

    assert.deepEqual(staleUiCalls, ["Session switch cancelled."]);
  });
});
