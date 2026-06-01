import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPreviewError,
  buildSessionDescription,
  buildSessionLabel,
  buildSessionPreview,
  buildSessionSearchEntries,
  filterSessionEntries,
  filterSessionInfos,
  formatTimestamp,
  formatRelativeTime,
  getSessionPaneLayout,
  parseLimit,
  type SessionInfoLike,
} from "../extensions/sessions/sessions.js";

describe("parseLimit", () => {
  it("returns default when args are missing", () => {
    assert.equal(parseLimit(undefined, 5), 5);
  });

  it("returns parsed value when valid", () => {
    assert.equal(parseLimit("12", 5), 12);
  });

  it("falls back to default for invalid values", () => {
    assert.equal(parseLimit("0", 5), 5);
    assert.equal(parseLimit("-2", 5), 5);
    assert.equal(parseLimit("nope", 5), 5);
  });
});

describe("formatTimestamp", () => {
  it("formats to YYYY-MM-DD HH:mm", () => {
    const date = new Date(2026, 1, 4, 14, 12, 0);
    assert.equal(formatTimestamp(date), "2026-02-04 14:12");
  });
});

describe("formatRelativeTime", () => {
  it("formats dates relative to now", () => {
    const now = new Date();
    
    // Just now (<60s)
    const justNowDate = new Date(now.getTime() - 10 * 1000);
    assert.equal(formatRelativeTime(justNowDate), "Just now");

    // Minutes ago (<60m)
    const minsAgoDate = new Date(now.getTime() - 15 * 60 * 1000);
    assert.equal(formatRelativeTime(minsAgoDate), "15m ago");

    // Hours ago (<24h)
    const hoursAgoDate = new Date(now.getTime() - 3 * 3600 * 1000);
    assert.equal(formatRelativeTime(hoursAgoDate), "3h ago");

    // Yesterday (1d)
    const yesterdayDate = new Date(now.getTime() - 25 * 3600 * 1000);
    assert.equal(formatRelativeTime(yesterdayDate), "Yesterday");

    // Days ago (>1d)
    const daysAgoDate = new Date(now.getTime() - 4 * 24 * 3600 * 1000);
    assert.equal(formatRelativeTime(daysAgoDate), "4d ago");
  });
});

describe("buildSessionLabel", () => {
  it("uses name when available", () => {
    const session: SessionInfoLike = {
      id: "abc123def456",
      name: "Refactor auth",
      cwd: "/work/app",
      modified: new Date(2026, 1, 4, 14, 12, 0),
      firstMessage: "hello",
      path: "/sessions/one.jsonl",
    };

    assert.equal(buildSessionLabel(session), "Refactor auth");
  });

  it("falls back to short id when name is missing", () => {
    const session: SessionInfoLike = {
      id: "abc123def456",
      cwd: "/work/app",
      modified: new Date(2026, 1, 4, 14, 12, 0),
      firstMessage: "hello",
      path: "/sessions/one.jsonl",
    };

    assert.equal(buildSessionLabel(session), "abc123de");
  });
});

describe("buildSessionDescription", () => {
  it("includes timestamp, snippet, and cwd", () => {
    const session: SessionInfoLike = {
      id: "abc123def456",
      name: "Refactor auth",
      cwd: "/work/app",
      modified: new Date(2026, 1, 4, 14, 12, 0),
      firstMessage: "Fix the login flow and update tests.",
      path: "/sessions/one.jsonl",
    };

    assert.equal(
      buildSessionDescription(session, 60),
      "2026-02-04 14:12 • Fix the login flow and update tests. — /work/app",
    );
  });

  it("truncates long snippets", () => {
    const session: SessionInfoLike = {
      id: "abc123def456",
      cwd: "/work/app",
      modified: new Date(2026, 1, 4, 14, 12, 0),
      firstMessage: "A".repeat(100),
      path: "/sessions/one.jsonl",
    };

    assert.equal(
      buildSessionDescription(session, 20),
      "2026-02-04 14:12 • AAAAAAAAAAAAAAAAAAA… — /work/app",
    );
  });
});

describe("filterSessionInfos", () => {
  const sessions: SessionInfoLike[] = [
    {
      id: "alpha111",
      name: "Refactor auth",
      cwd: "/work/app",
      modified: new Date(2026, 1, 4, 14, 12, 0),
      firstMessage: "one",
      path: "/sessions/one.jsonl",
    },
    {
      id: "bravo222",
      name: "Docs update",
      cwd: "/work/docs",
      modified: new Date(2026, 1, 5, 9, 30, 0),
      firstMessage: "two",
      path: "/sessions/two.jsonl",
    },
  ];

  it("returns all sessions when filter is empty", () => {
    assert.deepEqual(filterSessionInfos(sessions, ""), sessions);
  });

  it("precomputes search entries", () => {
    const entries = buildSessionSearchEntries(sessions);
    assert.equal(entries.length, 2);
    assert.ok(entries[0].searchText.includes("refactor auth"));
  });

  it("matches by session name substring", () => {
    const entries = buildSessionSearchEntries(sessions);
    const filtered = filterSessionEntries(entries, "factor");
    assert.deepEqual(filtered.map((entry) => entry.session), [sessions[0]]);
  });

  it("matches by cwd substring", () => {
    const entries = buildSessionSearchEntries(sessions);
    const filtered = filterSessionEntries(entries, "docs");
    assert.deepEqual(filtered.map((entry) => entry.session), [sessions[1]]);
  });

  it("matches by first message substring", () => {
    const entries = buildSessionSearchEntries(sessions);
    const filtered = filterSessionEntries(entries, "one");
    assert.deepEqual(filtered.map((entry) => entry.session), [sessions[0]]);
  });

  it("matches by id substring", () => {
    const entries = buildSessionSearchEntries(sessions);
    const filtered = filterSessionEntries(entries, "ha1");
    assert.deepEqual(filtered.map((entry) => entry.session), [sessions[0]]);
  });

  it("supports multi-token matching", () => {
    const entries = buildSessionSearchEntries(sessions);
    const filtered = filterSessionEntries(entries, "ref work");
    assert.deepEqual(filtered.map((entry) => entry.session), [sessions[0]]);
  });
});

describe("getSessionPaneLayout", () => {
  it("uses single-pane layout on narrow terminals", () => {
    assert.deepEqual(getSessionPaneLayout(79), {
      mode: "single",
      listWidth: 79,
      previewWidth: 0,
    });
  });

  it("uses the full terminal width for split-pane layout", () => {
    assert.deepEqual(getSessionPaneLayout(120), {
      mode: "split",
      listWidth: 42,
      previewWidth: 75,
    });
  });

  it("caps the list width on very wide terminals so preview gets most space", () => {
    assert.deepEqual(getSessionPaneLayout(200), {
      mode: "split",
      listWidth: 58,
      previewWidth: 139,
    });
  });
});

describe("buildSessionPreview", () => {
  const session: SessionInfoLike = {
    id: "abc123def456",
    name: "Preview test",
    cwd: "/work/app",
    modified: new Date(2026, 1, 4, 14, 12, 0),
    firstMessage: "hello",
    path: "/sessions/one.jsonl",
    messageCount: 3,
  };

  it("formats selected session messages as semantic preview blocks", () => {
    const preview = buildSessionPreview(session, [
      { role: "user", content: "Fix the sessions picker" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "I'll inspect it." },
          { type: "toolCall", name: "read" },
        ],
      },
      {
        role: "toolResult",
        toolName: "read",
        content: [{ type: "text", text: "extensions/sessions/index.ts" }],
      },
    ]);

    assert.equal(preview.title, "Preview test");
    assert.equal(preview.subtitle, "2026-02-04 14:12 · 3 messages · /work/app");
    assert.deepEqual(preview.blocks, [
      { kind: "user", text: "Fix the sessions picker" },
      { kind: "assistant", text: "I'll inspect it." },
      { kind: "toolCall", name: "read", args: undefined },
      { kind: "toolResult", name: "read", text: "extensions/sessions/index.ts", isError: undefined },
    ]);
  });

  it("truncates old messages when a preview would be too large", () => {
    const preview = buildSessionPreview(
      session,
      [
        { role: "user", content: "one" },
        { role: "assistant", content: [{ type: "text", text: "two" }] },
        { role: "user", content: "three" },
      ],
      { maxMessages: 2 },
    );

    assert.deepEqual(preview.blocks[0], { kind: "notice", text: "… 1 earlier messages omitted" });
    assert.ok(preview.blocks.some((block) => block.kind === "assistant" && block.text === "two"));
    assert.ok(preview.blocks.some((block) => block.kind === "user" && block.text === "three"));
  });

  it("formats preview load errors", () => {
    const preview = buildPreviewError(session, new Error("bad jsonl"));

    assert.equal(preview.error, "bad jsonl");
    assert.deepEqual(preview.blocks, [{ kind: "notice", text: "Failed to load preview: bad jsonl" }]);
  });
});
