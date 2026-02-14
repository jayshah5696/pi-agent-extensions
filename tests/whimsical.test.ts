import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import whimsicalExtension from "../extensions/whimsical/index.js";
import { GOODBYE_MESSAGES_BY_BUCKET } from "../extensions/whimsical/messages.js";

// Mock types
type CommandHandler = (args: string, ctx: any) => Promise<void>;
type EventHandler = (event: any, ctx: any) => Promise<void> | void;

describe("Whimsical Extension", () => {
  let commands: Map<string, CommandHandler>;
  let events: Map<string, EventHandler>;
  let mockPi: any;

  before(() => {
    commands = new Map();
    events = new Map();
    
    mockPi = {
      registerCommand: (name: string, options: any) => {
        // Handle both object and string signatures
        if (typeof name === 'object') {
            const cmd = name as any;
            commands.set(cmd.name, cmd.callback || cmd.handler);
        } else {
            commands.set(name, options.handler);
        }
      },
      on: (event: string, handler: EventHandler) => {
        events.set(event, handler);
      },
      registerFlag: () => {},
    };

    // Load the extension
    whimsicalExtension(mockPi);
  });

  it("registers /whimsy, /exit, and /bye commands", () => {
    assert.ok(commands.has("whimsy"));
    assert.ok(commands.has("exit"));
    assert.ok(commands.has("bye"));
  });

  it("registers turn_start and turn_end listeners", () => {
    assert.ok(events.has("turn_start"));
    assert.ok(events.has("turn_end"));
  });

  it("handles /exit command with graceful shutdown", async () => {
    const exitHandler = commands.get("exit");
    assert.ok(exitHandler);

    // Mock context
    let shutdownCalled = false;
    let notifyMessage = "";
    const mockCtx = {
      hasUI: true,
      ui: {
        notify: (msg: string) => { notifyMessage = msg; },
      },
      shutdown: () => { shutdownCalled = true; },
    };

    // Run the handler
    await exitHandler("", mockCtx);

    // Wait for setImmediate to run
    await new Promise(resolve => setImmediate(resolve));

    // Assert graceful shutdown was requested
    assert.equal(shutdownCalled, true, "ctx.shutdown() should be called");
    
    // Assert notification was shown with a goodbye message
    assert.ok(notifyMessage.startsWith("👋 "), "Should show goodbye message");
    const allGoodbyeMessages = Object.values(GOODBYE_MESSAGES_BY_BUCKET).flat();
    assert.ok(allGoodbyeMessages.some(msg => notifyMessage.includes(msg)), "Should use a message from GOODBYE_MESSAGES_BY_BUCKET");
  });
});
