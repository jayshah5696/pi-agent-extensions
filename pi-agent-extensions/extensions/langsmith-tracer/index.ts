/**
 * LangSmith Tracer Extension for Pi Coding Agent
 *
 * Intercepts Pi tool-call lifecycle events and forwards structured traces to
 * LangSmith.  Each Pi session becomes a root "chain" run; every tool call
 * becomes a child "tool" run linked via parent_run_id.
 *
 * Configuration (all optional, fall back to env vars):
 *   LANGSMITH_API_KEY   — API key.  Extension runs in no-op mode when absent.
 *   LANGSMITH_PROJECT   — LangSmith project name (default: "pi-agent")
 *   LANGCHAIN_ENDPOINT  — API base URL
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { LangSmithTracer } from "./tracer.js";
import type { SessionTrace, ToolRunTrace, LangSmithTracerConfig } from "./types.js";

export default function langsmithTracerExtension(
  pi: ExtensionAPI,
  config: LangSmithTracerConfig = {},
) {
  const tracer = new LangSmithTracer(config);

  /** Active session trace (one per Pi session) */
  let sessionTrace: SessionTrace | null = null;

  /** In-flight tool runs keyed by toolCallId */
  const activeToolRuns = new Map<string, ToolRunTrace>();

  // ── Session lifecycle ─────────────────────────────────────────────────────

  pi.on("session:start", async (...args: unknown[]) => {
    const event = args[0] as { task?: string; sessionId?: string } | undefined;
    const task = event?.task ?? "(no task)";
    const sessionId = event?.sessionId;

    try {
      sessionTrace = await tracer.startSession(task, sessionId);
    } catch {
      // tracer._safeCall already absorbs errors; this is extra safety
    }
  });

  pi.on("session:end", async (...args: unknown[]) => {
    if (!sessionTrace) return;
    const event = args[0] as { outputs?: Record<string, unknown> } | undefined;
    const outputs = event?.outputs ?? {};

    try {
      await tracer.endSession(sessionTrace, outputs);
    } catch {
      // ignored
    } finally {
      sessionTrace = null;
      activeToolRuns.clear();
    }
  });

  // ── Tool call lifecycle ───────────────────────────────────────────────────

  pi.on("tool:call:start", async (...args: unknown[]) => {
    if (!sessionTrace) return;

    const event = args[0] as
      | { toolCallId?: string; toolName?: string; inputs?: Record<string, unknown> }
      | undefined;

    const toolCallId = event?.toolCallId ?? crypto.randomUUID();
    const toolName = event?.toolName ?? "unknown_tool";
    const inputs = event?.inputs ?? {};

    try {
      const toolRun = await tracer.startToolCall(sessionTrace, toolName, inputs, toolCallId);
      activeToolRuns.set(toolCallId, toolRun);
    } catch {
      // ignored
    }
  });

  pi.on("tool:call:end", async (...args: unknown[]) => {
    const event = args[0] as
      | { toolCallId?: string; outputs?: Record<string, unknown>; error?: string }
      | undefined;

    const toolCallId = event?.toolCallId;
    if (!toolCallId) return;

    const toolRun = activeToolRuns.get(toolCallId);
    if (!toolRun) return;

    try {
      await tracer.endToolCall(toolRun, event?.outputs ?? {}, event?.error);
    } catch {
      // ignored
    } finally {
      activeToolRuns.delete(toolCallId);
    }
  });
}
