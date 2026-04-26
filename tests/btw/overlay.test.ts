import { describe, it } from "node:test";
import assert from "node:assert/strict";
import btwExtension from "../../extensions/btw/index.js";

type CommandHandler = (args: string, ctx: any) => Promise<void>;

describe("BTW overlay", () => {
  it("renders a scrollable full-page overlay for long question and answer text", async () => {
    let btwHandler: CommandHandler | undefined;

    const mockPi = {
      registerCommand: (name: string, options: any) => {
        if (name === "btw") btwHandler = options.handler;
      },
    };

    btwExtension(mockPi as any);
    assert.ok(btwHandler);

    const question = Array.from({ length: 20 }, (_, i) => `Question line ${i + 1}`).join(" ");
    const answer = Array.from({ length: 60 }, (_, i) => `Answer paragraph ${i + 1}`).join("\n");

    let overlayRender: ((width: number) => string[]) | undefined;
    let overlayHandleInput: ((data: string) => void) | undefined;
    let customCall = 0;

    const ctx = {
      hasUI: true,
      model: { id: "openai/gpt-5.4" },
      modelRegistry: {},
      sessionManager: {
        buildSessionContext: () => ({ messages: [] }),
      },
      ui: {
        notify: () => undefined,
        custom: async (factory: any, options?: any) => {
          customCall += 1;
          if (customCall === 1) {
            return answer;
          }

          assert.equal(options?.overlay, true);
          assert.equal(options?.overlayOptions?.anchor, "center");

          const tui = {
            height: 20,
            requestRender: () => undefined,
          };
          const theme = {
            fg: (_name: string, text: string) => text,
            bold: (text: string) => text,
          };

          const component = factory(tui, theme, undefined, () => undefined);
          overlayRender = component.render.bind(component);
          overlayHandleInput = component.handleInput.bind(component);
          return undefined;
        },
      },
    };

    await btwHandler!(question, ctx);

    assert.ok(overlayRender);
    assert.ok(overlayHandleInput);

    const initialLines = overlayRender!(100);
    const initialText = initialLines.join("\n");
    assert.match(initialText, /BTW/);
    assert.match(initialText, /Question/);
    assert.match(initialText, /Answer/);
    assert.match(initialText, /Answer paragraph 1/);
    assert.match(initialText, /(side question|editorial-style)/);

    overlayHandleInput!("\u001b[6~"); // PageDown
    const pagedLines = overlayRender!(100);
    const pagedText = pagedLines.join("\n");
    assert.notEqual(pagedText, initialText);
  });
});
