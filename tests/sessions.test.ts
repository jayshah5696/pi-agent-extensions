import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSessionDescription,
  buildSessionLabel,
  buildSessionSearchEntries,
  filterSessionEntries,
  filterSessionInfos,
  formatTimestamp,
  parseLimit,
  type SessionInfoLike,
  formatPreviewEntries,
} from "../extensions/sessions/sessions.js";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";


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

describe("formatPreviewEntries", () => {
  const theme = {
    fg: (key: string, text: string) => `[${key}]${text}[/${key}]`,
    bold: (text: string) => `[bold]${text}[/bold]`,
  };

  it("formats user and assistant messages with indentation and color markup", () => {
    const entries: SessionEntry[] = [
      {
        type: "message",
        id: "msg1",
        parentId: null,
        timestamp: new Date().toISOString(),
        message: {
          role: "user",
          content: [{ type: "text", text: "Hello agent" }],
          timestamp: Date.now(),
        },
      },
      {
        type: "message",
        id: "msg2",
        parentId: "msg1",
        timestamp: new Date().toISOString(),
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello user! How can I help you today?" }],
          timestamp: Date.now(),
        },
      },
    ];

    const lines = formatPreviewEntries(entries, 30, theme);
    
    // Check role highlighting
    assert.ok(lines.includes("[accent][bold]User:[/bold][/accent]"));
    assert.ok(lines.includes("[warning][bold]Assistant:[/bold][/warning]"));

    // Check message wrapping & indentation
    assert.ok(lines.includes("  Hello agent"));
    // The assistant message must be wrapped because rightWidth-2 is 28 and text is 37
    assert.ok(lines.some(l => l.startsWith("  Hello user!")));
  });

  it("handles compaction and branch summaries", () => {
    const entries: SessionEntry[] = [
      {
        type: "compaction",
        id: "comp1",
        parentId: null,
        timestamp: new Date().toISOString(),
        summary: "Compacted initial setup",
        firstKeptEntryId: "msg1",
        tokensBefore: 100,
      },
      {
        type: "branch_summary",
        id: "branch1",
        parentId: "comp1",
        timestamp: new Date().toISOString(),
        fromId: "msg1",
        summary: "Branched off tests",
      }
    ];

    const lines = formatPreviewEntries(entries, 40, theme);
    assert.ok(lines.includes("[dim][Compaction: Compacted initial setup][/dim]"));
    assert.ok(lines.includes("[dim][Branch Summary: Branched off tests][/dim]"));
  });
});

