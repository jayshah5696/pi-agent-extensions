import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { createWorkflowExtension } from "../../extensions/workflow/index.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("workflow extension registration", () => {
  it("registers the singular command and activates the tool only for trusted projects", async () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-extension-"));
    roots.push(root);
    const commands = new Map<string, any>();
    const tools = new Map<string, any>();
    const events = new Map<string, any>();
    const messages: string[] = [];
    let activeTools: string[] = ["read"];
    const pi = {
      registerCommand(name: string, options: any) {
        commands.set(name, options.handler);
      },
      registerTool(tool: any) {
        tools.set(tool.name, tool);
      },
      on(event: string, handler: any) {
        events.set(event, handler);
      },
      getActiveTools() {
        return activeTools;
      },
      setActiveTools(next: string[]) {
        activeTools = next;
      },
      sendMessage(message: { content: string }) {
        messages.push(message.content);
      },
    } as any;

    createWorkflowExtension({ cwd: root, runsDir: join(root, "runs") })(pi);
    assert.ok(commands.has("workflow"));
    assert.ok(tools.has("workflow"));
    assert.ok(events.has("session_start"));

    const context = {
      model: undefined,
      modelRegistry: {
        getRegisteredProviderIds: () => [],
        getRegisteredProviderConfig: () => undefined,
      },
      sessionManager: { getSessionId: () => "session-1" },
      mode: "print",
      ui: { setWidget() {} },
      isProjectTrusted: () => false,
    };
    events.get("session_start")({}, context);
    assert.deepEqual(activeTools, ["read"]);
    context.isProjectTrusted = () => true;
    events.get("session_start")({}, context);
    assert.deepEqual(activeTools, ["read", "workflow"]);

    await commands.get("workflow")("help", { ui: { notify() {} } });
    assert.match(messages.at(-1) ?? "", /\/workflow setup/);
  });
});
