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
  });

  async function createFooter(statuses: Map<string, string>) {
    let footerFactory: any;
    await events.get("session_start")!({}, {
      hasUI: true,
      cwd: "/tmp/project",
      model: { name: "Example Chat 1" },
      modelRegistry: { isUsingOAuth: () => false },
      getContextUsage: () => ({ tokens: 36400, contextWindow: 500000, percent: 8.1 }),
      sessionManager: { getSessionName: () => "", getEntries: () => [] },
      ui: { setFooter: (factory: any) => { footerFactory = factory; } },
    });
    return footerFactory({ requestRender: () => {} }, {}, {
      getGitBranch: () => undefined,
      getExtensionStatuses: () => statuses,
    });
  }

  const plain = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");

  it("reserves space for styled statuses without truncating the clock", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 1800000000000 });
    const statuses = new Map([
      ["token-speed", "\x1b[38;5;150m⚡ TPS: 35.9 tok/s\x1b[0m"],
      ["control", "session 漢字"],
      ["empty", ""],
    ]);
    const footer = await createFooter(statuses);
    t.after(() => footer.dispose());
    const clock = plain(footer.render(200)[0]).match(/\d{2}:\d{2}/)?.[0];
    assert.ok(clock);

    for (const width of [80, 120, 200]) {
      const lines = footer.render(width);
      assert.equal(lines.length, 1);
      assert.equal(visibleWidth(lines[0]), width);
      assert.ok(plain(lines[0]).endsWith(`${clock} | ⚡ TPS: 35.9 tok/s session 漢字`));
      assert.ok(plain(lines[0]).includes("Example Chat 1"));
    }
  });

  it("wraps overflowing statuses onto separate lines and fits tiny widths", async (t) => {
    const footer = await createFooter(new Map([
      ["speed", "\x1b[32m⚡ TPS: 35.9 tok/s\x1b[0m"],
      ["long", "status-".repeat(30)],
    ]));
    t.after(() => footer.dispose());
    for (const width of [0, 1, 2, 3, 10, 40, 80, 200]) {
      const lines = footer.render(width);
      assert.ok(lines.every((line: string) => visibleWidth(line) <= width), `width ${width}`);
      if (width >= 40) {
        assert.ok(lines.length > 1);
        if (width >= 80) assert.match(plain(lines[0]), /\d{2}:\d{2}$/);
        const statusOutput = lines.slice(1).map(plain).join("");
        assert.ok(statusOutput.includes("TPS: 35.9 tok/s"));
        assert.ok(statusOutput.includes("status-".repeat(30)));
      }
    }
    footer.dispose();
    assert.ok(footer.render(2).every((line: string) => visibleWidth(line) <= 2));
  });

  it("reads status changes each render and returns to one line when cleared", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 1800000000000 });
    const statuses = new Map<string, string>();
    const footer = await createFooter(statuses);
    t.after(() => footer.dispose());
    const original = plain(footer.render(120)[0]);
    statuses.set("empty", "");
    assert.equal(plain(footer.render(120)[0]), original);
    statuses.set("speed", "TPS: 35.9 tok/s");
    assert.ok(plain(footer.render(120)[0]).endsWith("TPS: 35.9 tok/s"));
    statuses.set("speed", "Updated status ".repeat(20));
    assert.ok(footer.render(40).length > 1);
    assert.equal(footer.render(400).length, 1);
    statuses.clear();
    assert.equal(footer.render(120).length, 1);
    assert.equal(plain(footer.render(120)[0]), original);
  });

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

    footer.render(120);
    const initialRenderCount = renderCallCount;

    // Branch is undefined so fetchAsyncData sets gitStatusExtras = "" (unchanged)
    (footer as any).fetchAsyncData();

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

    // Mock setInterval before creating footer to capture the callback
    // and prevent a real 10s timer from holding the event loop open
    let intervalCb: any;
    const originalSetInterval = global.setInterval;
    (global.setInterval as any) = (cb: any) => { intervalCb = cb; return 123; };

    try {
        const footer = footerFactory!(tui, {}, footerData);

        // Render once to set lastRenderedMinute to current minute
        footer.render(120);
        const countBefore = renderCallCount;

        // Interval fires but minute hasn't changed — no requestRender
        intervalCb();
        assert.equal(renderCallCount, countBefore);

        // Simulate a minute change by forcing lastRenderedMinute to a stale value
        (footer as any).lastRenderedMinute = -2;

        intervalCb();
        assert.equal(renderCallCount, countBefore + 1);

        footer.dispose();
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

        // Interval callback after dispose should be a no-op
        const countBefore = renderCallCount;
        (footer as any).lastRenderedMinute = -2;
        intervalCb();

        assert.equal(renderCallCount, countBefore);
    } finally {
        global.clearInterval = originalClearInterval;
        global.setInterval = originalSetInterval;
    }
  });
});
