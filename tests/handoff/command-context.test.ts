import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Regression test for the stale ctx error reported by Pi after ctx.newSession().
// The extension must perform post-replacement UI work via withSession(newCtx),
// not via the original command ctx.
describe("handoff session replacement flow", () => {
  it("uses the replacement ctx inside newSession.withSession", async () => {
    const staleUiCalls: string[] = [];
    const freshUiCalls: string[] = [];

    const staleCtx = {
      hasUI: true,
      model: { provider: "anthropic", id: "claude-sonnet-4-5" },
      sessionManager: {
        getCwd: () => process.cwd(),
        buildSessionContext: () => ({
          messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
        }),
        getSessionFile: () => "/tmp/session.jsonl",
        getSessionName: () => "test",
      },
      ui: {
        notify: (msg: string) => {
          staleUiCalls.push(`stale:${msg}`);
        },
        editor: async (_title: string, prefill?: string) => prefill,
        setEditorText: (_text: string) => {
          staleUiCalls.push("stale:setEditorText");
        },
      },
      newSession: async (options?: {
        parentSession?: string;
        withSession?: (ctx: any) => Promise<void>;
      }) => {
        assert.equal(options?.parentSession, "/tmp/session.jsonl");
        assert.ok(options?.withSession, "expected withSession callback");
        await options?.withSession?.({
          ui: {
            notify: (msg: string) => {
              freshUiCalls.push(`fresh:${msg}`);
            },
            setEditorText: (_text: string) => {
              freshUiCalls.push("fresh:setEditorText");
            },
          },
        });
        return { cancelled: false };
      },
    } as any;

    const currentSessionFile = staleCtx.sessionManager.getSessionFile();
    const editedPrompt = "continue the work";

    const result = await staleCtx.newSession({
      parentSession: currentSessionFile,
      withSession: async (newCtx: any) => {
        newCtx.ui.setEditorText(editedPrompt);
        newCtx.ui.notify("Handoff ready. Press Enter to send.", "info");
      },
    });

    assert.equal(result.cancelled, false);
    assert.deepEqual(staleUiCalls, []);
    assert.deepEqual(freshUiCalls, [
      "fresh:setEditorText",
      "fresh:Handoff ready. Press Enter to send.",
    ]);
  });
});
