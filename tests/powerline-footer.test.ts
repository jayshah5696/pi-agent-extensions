import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import powerlineFooterExtension from "../extensions/powerline-footer/index.js";
import { visibleWidth } from "@earendil-works/pi-tui";

type EventHandler = (event: any, ctx: any) => Promise<void> | void;

describe("Powerline Footer Extension", () => {
  let events: Map<string, EventHandler>;
  let mockPi: any;

  beforeEach(() => {
    events = new Map();
    mockPi = {
      on: (event: string, handler: EventHandler) => {
        events.set(event, handler);
      },
    };

    powerlineFooterExtension(mockPi);
  });

  it("registers a session_start listener", () => {
    assert.ok(events.has("session_start"));
  });

  it("renders safely when the captured ctx later becomes stale", async () => {
    const sessionStart = events.get("session_start");
    assert.ok(sessionStart);

    let footerFactory: ((tui: any, theme: any, footerData: any) => any) | undefined;
    let stale = false;
    const staleError = new Error(
      "This extension ctx is stale after session replacement or reload.",
    );

    const ctx = {
      hasUI: true,
      get cwd() {
        if (stale) throw staleError;
        return "/tmp/pi-agent-extensions";
      },
      get model() {
        if (stale) throw staleError;
        return {
          id: "anthropic/claude-opus-4.7",
          name: "Claude Opus 4.7",
          provider: "Anthropic",
        };
      },
      modelRegistry: {
        isUsingOAuth: () => false,
      },
      getContextUsage: () => {
        if (stale) throw staleError;
        return {
          tokens: 1234,
          contextWindow: 1000000,
          percent: 12.3,
        };
      },
      sessionManager: {
        getSessionName: () => {
          if (stale) throw staleError;
          return "demo";
        },
        getEntries: () => {
          if (stale) throw staleError;
          return [
            {
              type: "message",
              message: {
                role: "assistant",
                usage: {
                  cost: { total: 0.123 },
                },
              },
            },
          ];
        },
      },
      ui: {
        setFooter: (factory: (tui: any, theme: any, footerData: any) => any) => {
          footerFactory = factory;
        },
      },
    };

    await sessionStart?.({}, ctx);
    assert.ok(footerFactory, "session_start should register a footer factory");

    const tui = {
      requestRender: () => undefined,
    };
    const theme = {};
    const footerData = {
      getGitBranch: () => undefined,
      getExtensionStatuses: () => new Map(),
    };

    const footer = footerFactory!(tui, theme, footerData);
    const freshRender = footer.render(120);
    assert.equal(Array.isArray(freshRender), true);
    assert.equal(freshRender.length, 1);
    assert.ok(visibleWidth(freshRender[0]) <= 120);
    assert.match(freshRender[0], /\$0\.123/);

    const narrowRender = footer.render(40);
    assert.equal(narrowRender.length, 1);
    assert.ok(visibleWidth(narrowRender[0]) <= 40);

    stale = true;
    assert.doesNotThrow(() => footer.render(120));
    assert.doesNotThrow(() => footer.render(40));
    assert.ok(visibleWidth(footer.render(120)[0]) <= 120);
    assert.ok(visibleWidth(footer.render(40)[0]) <= 40);

    footer.dispose();
    assert.doesNotThrow(() => footer.render(120));
    assert.doesNotThrow(() => footer.render(40));
    assert.ok(visibleWidth(footer.render(120)[0]) <= 120);
    assert.ok(visibleWidth(footer.render(40)[0]) <= 40);
  
  it("does not call requestRender when git status extras have not changed", async () => {
    const sessionStart = events.get("session_start");
    let footerFactory: any;
    const ctx = {
      hasUI: true,
      cwd: "/tmp",
      model: {},
      modelRegistry: { isUsingOAuth: () => false },
      getContextUsage: () => null,
      sessionManager: { getSessionName: () => "", getEntries: () => [] },
      ui: { setFooter: (f: any) => { footerFactory = f; } }
    };

    await sessionStart?.({}, ctx);

    let renderCallCount = 0;
    const tui = { requestRender: () => { renderCallCount++; } };
    const footerData = { getGitBranch: () => undefined, getExtensionStatuses: () => new Map() };

    const footer = footerFactory!(tui, {}, footerData);
    
    // Test that creating a PowerlineFooter and calling render works correctly
    footer.render(120);

    const initialRenderCount = renderCallCount;

    // Call fetchAsyncData manually by exploiting the interval timer. Since we mock the clock/time, we can just wait or wait out.
    // Actually, branch is undefined, so fetchAsyncData returns early and sets gitStatusExtras = "".
    // We can call it directly if it was public, but it's private.
    // Instead we can use mocked setInterval? No, we don't mock timers here.
    // Wait, let's just use the 'any' cast to call fetchAsyncData.
    (footer as any).fetchAsyncData();

    // Since git branch is undefined, gitStatusExtras is "" (unchanged), so it shouldn't call requestRender
    assert.equal(renderCallCount, initialRenderCount);
    footer.dispose();
  });

  it("calls requestRender when the clock minute changes", async () => {
    const sessionStart = events.get("session_start");
    let footerFactory: any;
    const ctx = {
      hasUI: true,
      cwd: "/tmp",
      model: {},
      modelRegistry: { isUsingOAuth: () => false },
      getContextUsage: () => null,
      sessionManager: { getSessionName: () => "", getEntries: () => [] },
      ui: { setFooter: (f: any) => { footerFactory = f; } }
    };

    await sessionStart?.({}, ctx);

    let renderCallCount = 0;
    const tui = { requestRender: () => { renderCallCount++; } };
    const footerData = { getGitBranch: () => undefined, getExtensionStatuses: () => new Map() };

    const footer = footerFactory!(tui, {}, footerData);
    
    // Initially lastRenderedMinute is -1
    // The interval function does:
    // const currentMinute = new Date().getMinutes();
    // if (currentMinute !== this.lastRenderedMinute) { this.lastRenderedMinute = currentMinute; this.tui.requestRender(); }
    
    const initialRenderCount = renderCallCount;

    // We can trigger the interval callback directly if we capture it
    // Wait, setInterval is mocked or not? No, it's not mocked.
    // So we can just access (footer as any).interval and the callback is not accessible.
    // Let's mock global.setInterval before creating footer.
    let intervalCb: any;
    const originalSetInterval = global.setInterval;
    (global.setInterval as any) = (cb: any) => { intervalCb = cb; return 123; };

    try {
        const footer2 = footerFactory!(tui, {}, footerData);
        
        const countBefore = renderCallCount;
        
        // Render it once to set lastRenderedMinute
        footer2.render(120);

        // Call the interval callback
        intervalCb();
        
        // Minute hasn't changed since render, so renderCallCount shouldn't change
        assert.equal(renderCallCount, countBefore);
        
        // Now mess with lastRenderedMinute to simulate minute change
        (footer2 as any).lastRenderedMinute = -2;
        
        intervalCb();
        
        // Now it should have incremented
        assert.equal(renderCallCount, countBefore + 1);

        footer2.dispose();
    } finally {
        global.setInterval = originalSetInterval;
    }
  });

  it("dispose clears the interval and prevents further requestRender calls", async () => {
    const sessionStart = events.get("session_start");
    let footerFactory: any;
    const ctx = {
      hasUI: true,
      cwd: "/tmp",
      model: {},
      modelRegistry: { isUsingOAuth: () => false },
      getContextUsage: () => null,
      sessionManager: { getSessionName: () => "", getEntries: () => [] },
      ui: { setFooter: (f: any) => { footerFactory = f; } }
    };

    await sessionStart?.({}, ctx);

    let renderCallCount = 0;
    const tui = { requestRender: () => { renderCallCount++; } };
    const footerData = { getGitBranch: () => undefined, getExtensionStatuses: () => new Map() };

    let intervalCleared = false;
    const originalClearInterval = global.clearInterval;
    (global.clearInterval as any) = () => { intervalCleared = true; };

    let intervalCb: any;
    const originalSetInterval = global.setInterval;
    (global.setInterval as any) = (cb: any) => { intervalCb = cb; return 123; };

    try {
        const footer = footerFactory!(tui, {}, footerData);
        
        footer.dispose();
        
        assert.ok(intervalCleared);
        assert.equal((footer as any).interval, undefined);

        // Calling interval callback after dispose should not do anything
        const countBefore = renderCallCount;
        (footer as any).lastRenderedMinute = -2; // simulate time change
        intervalCb(); // should return early because disposed = true

        assert.equal(renderCallCount, countBefore);
    } finally {
        global.clearInterval = originalClearInterval;
        global.setInterval = originalSetInterval;
    }
  });
});
});
