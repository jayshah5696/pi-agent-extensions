/**
 * LangSmith Tracer — Test Suite
 *
 * Tests use Vitest with vi.fn() mocks so no real network calls are made.
 * Each test creates its own LangSmithTracer instance to avoid shared state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LangSmithTracer } from "../tracer.js";

// ─── Mock the langsmith Client ───────────────────────────────────────────────

const mockCreateRun = vi.fn().mockResolvedValue(undefined);
const mockUpdateRun = vi.fn().mockResolvedValue(undefined);

// vi.mock factory must return a module shape where Client is a class/constructor
vi.mock("langsmith", () => {
  // Use a real class so `new Client(...)` works
  class MockClient {
    createRun = mockCreateRun;
    updateRun = mockUpdateRun;
  }
  return { Client: MockClient };
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTracer(apiKey = "test-key") {
  return new LangSmithTracer({ apiKey, project: "test-project" });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("LangSmithTracer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── no-op mode ─────────────────────────────────────────────────────────────

  describe("no-op mode (missing API key)", () => {
    it("emits a warning and does not throw when API key is absent", async () => {
      const warn = vi.fn();
      const tracer = new LangSmithTracer({ apiKey: "" }, warn);

      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toMatch(/no-op mode/i);
      expect(tracer.isActive).toBe(false);
    });

    it("startSession returns a SessionTrace without calling LangSmith", async () => {
      const tracer = new LangSmithTracer({ apiKey: "" }, vi.fn());
      const session = await tracer.startSession("build a thing");

      expect(session.task).toBe("build a thing");
      expect(session.rootRunId).toBeTypeOf("string");
      expect(mockCreateRun).not.toHaveBeenCalled();
    });

    it("startToolCall returns a ToolRunTrace without calling LangSmith", async () => {
      const tracer = new LangSmithTracer({ apiKey: "" }, vi.fn());
      const session = await tracer.startSession("task");
      const toolRun = await tracer.startToolCall(session, "read_file", { path: "/tmp/x" });

      expect(toolRun.toolName).toBe("read_file");
      expect(toolRun.parentRunId).toBe(session.rootRunId);
      expect(mockCreateRun).not.toHaveBeenCalled();
    });

    it("endSession and endToolCall are safe no-ops", async () => {
      const tracer = new LangSmithTracer({ apiKey: "" }, vi.fn());
      const session = await tracer.startSession("task");
      const toolRun = await tracer.startToolCall(session, "write_file", {});
      await tracer.endToolCall(toolRun, { result: "ok" });
      await tracer.endSession(session, { summary: "done" });

      expect(mockCreateRun).not.toHaveBeenCalled();
      expect(mockUpdateRun).not.toHaveBeenCalled();
    });
  });

  // ── session root run ───────────────────────────────────────────────────────

  describe("session root run creation", () => {
    it("calls client.createRun with correct shape for a new session", async () => {
      const tracer = makeTracer();
      const session = await tracer.startSession("implement feature X");

      expect(mockCreateRun).toHaveBeenCalledOnce();
      const [call] = mockCreateRun.mock.calls;
      expect(call[0]).toMatchObject({
        id: session.rootRunId,
        name: "pi_session",
        run_type: "chain",
        project_name: "test-project",
        inputs: { task: "implement feature X" },
      });
      expect(call[0].start_time).toBeTypeOf("number");
    });

    it("accepts a caller-supplied sessionId as the root run id", async () => {
      const tracer = makeTracer();
      const customId = "aaaa-bbbb-cccc";
      const session = await tracer.startSession("task", customId);

      expect(session.rootRunId).toBe(customId);
      expect(mockCreateRun.mock.calls[0][0].id).toBe(customId);
    });

    it("generates unique root run ids for different sessions", async () => {
      const tracer = makeTracer();
      const s1 = await tracer.startSession("task one");
      const s2 = await tracer.startSession("task two");

      expect(s1.rootRunId).not.toBe(s2.rootRunId);
    });
  });

  // ── session end ────────────────────────────────────────────────────────────

  describe("session completion", () => {
    it("calls client.updateRun with outputs and end_time when ending a session", async () => {
      const tracer = makeTracer();
      const session = await tracer.startSession("task");
      await tracer.endSession(session, { status: "success" });

      expect(mockUpdateRun).toHaveBeenCalledOnce();
      const [id, payload] = mockUpdateRun.mock.calls[0];
      expect(id).toBe(session.rootRunId);
      expect(payload.outputs).toEqual({ status: "success" });
      expect(payload.end_time).toBeTypeOf("number");
    });
  });

  // ── child tool run ────────────────────────────────────────────────────────

  describe("tool-call child run creation", () => {
    it("creates a child run with the correct parent_run_id", async () => {
      const tracer = makeTracer();
      const session = await tracer.startSession("task");
      vi.clearAllMocks(); // only care about tool call

      await tracer.startToolCall(session, "read_file", { path: "/src/main.ts" });

      expect(mockCreateRun).toHaveBeenCalledOnce();
      const [call] = mockCreateRun.mock.calls;
      expect(call[0].parent_run_id).toBe(session.rootRunId);
      expect(call[0].run_type).toBe("tool");
      expect(call[0].name).toBe("read_file");
      expect(call[0].inputs).toEqual({ path: "/src/main.ts" });
    });

    it("completes a tool run with outputs and end_time", async () => {
      const tracer = makeTracer();
      const session = await tracer.startSession("task");
      const toolRun = await tracer.startToolCall(session, "write_file", {});
      vi.clearAllMocks();

      const result = await tracer.endToolCall(toolRun, { bytes_written: 42 });

      expect(mockUpdateRun).toHaveBeenCalledOnce();
      const [id, payload] = mockUpdateRun.mock.calls[0];
      expect(id).toBe(toolRun.toolRunId);
      expect(payload.outputs).toEqual({ bytes_written: 42 });
      expect(payload.end_time).toBeTypeOf("number");

      // Result mirrors what was passed
      expect(result.outputs).toEqual({ bytes_written: 42 });
    });
  });

  // ── parallel / fork tool calls ────────────────────────────────────────────

  describe("parallel / fork tool calls as siblings", () => {
    it("creates multiple tool runs with the same parent_run_id (sibling runs)", async () => {
      const tracer = makeTracer();
      const session = await tracer.startSession("multi-tool task");
      vi.clearAllMocks();

      const [t1, t2, t3] = await Promise.all([
        tracer.startToolCall(session, "read_file", { path: "/a" }),
        tracer.startToolCall(session, "read_file", { path: "/b" }),
        tracer.startToolCall(session, "search_web", { query: "vitest" }),
      ]);

      expect(mockCreateRun).toHaveBeenCalledTimes(3);

      // All share the same parent
      for (const call of mockCreateRun.mock.calls) {
        expect(call[0].parent_run_id).toBe(session.rootRunId);
      }

      // Each has a distinct toolRunId
      const ids = [t1.toolRunId, t2.toolRunId, t3.toolRunId];
      expect(new Set(ids).size).toBe(3);
    });

    it("completes sibling runs independently", async () => {
      const tracer = makeTracer();
      const session = await tracer.startSession("task");
      const [t1, t2] = await Promise.all([
        tracer.startToolCall(session, "tool_a", {}),
        tracer.startToolCall(session, "tool_b", {}),
      ]);
      vi.clearAllMocks();

      await Promise.all([
        tracer.endToolCall(t1, { result: "a" }),
        tracer.endToolCall(t2, { result: "b" }),
      ]);

      expect(mockUpdateRun).toHaveBeenCalledTimes(2);
      const updatedIds = mockUpdateRun.mock.calls.map((c) => c[0]);
      expect(updatedIds).toContain(t1.toolRunId);
      expect(updatedIds).toContain(t2.toolRunId);
    });
  });

  // ── error handling ────────────────────────────────────────────────────────

  describe("error handling — LangSmith unavailable", () => {
    it("does not throw when createRun rejects", async () => {
      mockCreateRun.mockRejectedValueOnce(new Error("Network error"));
      const warn = vi.fn();
      const tracer = new LangSmithTracer({ apiKey: "key" }, warn);

      // Should not throw
      const session = await tracer.startSession("task");
      expect(session).toBeDefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Network error"));
    });

    it("does not throw when updateRun rejects on endToolCall", async () => {
      const warn = vi.fn();
      const tracer = new LangSmithTracer({ apiKey: "key" }, warn);
      const session = await tracer.startSession("task");
      const toolRun = await tracer.startToolCall(session, "tool", {});
      mockUpdateRun.mockRejectedValueOnce(new Error("Timeout"));

      await expect(tracer.endToolCall(toolRun, {})).resolves.toBeDefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Timeout"));
    });

    it("does not throw when updateRun rejects on endSession", async () => {
      const warn = vi.fn();
      const tracer = new LangSmithTracer({ apiKey: "key" }, warn);
      const session = await tracer.startSession("task");
      mockUpdateRun.mockRejectedValueOnce(new Error("503"));

      await expect(tracer.endSession(session, {})).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("503"));
    });
  });

  // ── error propagation in tool runs ───────────────────────────────────────

  describe("tool run error propagation", () => {
    it("includes error string in updateRun payload when tool call fails", async () => {
      const tracer = makeTracer();
      const session = await tracer.startSession("task");
      const toolRun = await tracer.startToolCall(session, "risky_tool", {});
      vi.clearAllMocks();

      await tracer.endToolCall(toolRun, {}, "Permission denied");

      const [, payload] = mockUpdateRun.mock.calls[0];
      expect(payload.error).toBe("Permission denied");
    });

    it("does not include error key when tool call succeeds", async () => {
      const tracer = makeTracer();
      const session = await tracer.startSession("task");
      const toolRun = await tracer.startToolCall(session, "safe_tool", {});
      vi.clearAllMocks();

      await tracer.endToolCall(toolRun, { ok: true });

      const [, payload] = mockUpdateRun.mock.calls[0];
      expect(payload).not.toHaveProperty("error");
    });
  });

  // ── isActive ──────────────────────────────────────────────────────────────

  describe("isActive property", () => {
    it("is true when an API key is provided", () => {
      const tracer = makeTracer("real-key");
      expect(tracer.isActive).toBe(true);
    });

    it("is false when API key is empty string", () => {
      const tracer = new LangSmithTracer({ apiKey: "" }, vi.fn());
      expect(tracer.isActive).toBe(false);
    });
  });
});
