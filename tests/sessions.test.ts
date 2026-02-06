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
