/**
 * LangSmith Tracer - Core client logic
 *
 * Manages run trees: one root run per Pi session, one child run per tool call.
 * Falls back to no-op mode when LANGSMITH_API_KEY is absent or LangSmith
 * is unreachable.
 */

import { Client } from "langsmith";
import type {
  LangSmithTracerConfig,
  ResolvedConfig,
  SessionTrace,
  ToolRunTrace,
  TracedToolResult,
} from "./types.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

function nowMs(): number {
  return Date.now();
}

// ─── LangSmithTracer ────────────────────────────────────────────────────────

/**
 * Core tracer.  Instantiate one per Pi session (or share across sessions — it
 * is stateless except for in-flight run records which are per-call scoped).
 *
 * When no API key is available the tracer operates in **no-op** mode: all
 * methods are safe to call but produce no side-effects and return sensible
 * placeholder values.
 */
export class LangSmithTracer {
  private readonly config: ResolvedConfig | null;
  private readonly client: Client | null;

  /**
   * @param rawConfig  Optional config overrides.  Falls back to env vars.
   * @param warnFn     Optional logger for the "no API key" warning.
   */
  constructor(
    rawConfig: LangSmithTracerConfig = {},
    private readonly warnFn: (msg: string) => void = console.warn,
  ) {
    const apiKey = rawConfig.apiKey ?? process.env["LANGSMITH_API_KEY"] ?? "";
    const project =
      rawConfig.project ?? process.env["LANGSMITH_PROJECT"] ?? "pi-agent";
    const apiUrl =
      rawConfig.apiUrl ??
      process.env["LANGCHAIN_ENDPOINT"] ??
      "https://api.smith.langchain.com";

    if (!apiKey) {
      this.warnFn(
        "[langsmith-tracer] LANGSMITH_API_KEY is not set — operating in no-op mode. " +
          "Set the env var to enable tracing.",
      );
      this.config = null;
      this.client = null;
    } else {
      this.config = { apiKey, project, apiUrl };
      this.client = new Client({ apiKey, apiUrl });
    }
  }

  /** True when we have a valid API key and will actually send traces */
  get isActive(): boolean {
    return this.config !== null;
  }

  // ── Session (root run) ────────────────────────────────────────────────────

  /**
   * Create a root "chain" run to represent the entire Pi session.
   * Returns a {@link SessionTrace} that callers should keep to pass back
   * when creating child runs.
   */
  async startSession(task: string, sessionId?: string): Promise<SessionTrace> {
    const rootRunId = sessionId ?? uuid();
    const startTime = nowMs();

    if (!this.client || !this.config) {
      return { rootRunId, startTime, task };
    }

    await this._safeCall("startSession", () =>
      this.client!.createRun({
        id: rootRunId,
        name: "pi_session",
        run_type: "chain",
        project_name: this.config!.project,
        inputs: { task },
        start_time: startTime,
      }),
    );

    return { rootRunId, startTime, task };
  }

  /**
   * Mark the root session run as complete.
   */
  async endSession(
    session: SessionTrace,
    outputs: Record<string, unknown> = {},
  ): Promise<void> {
    if (!this.client) return;

    await this._safeCall("endSession", () =>
      this.client!.updateRun(session.rootRunId, {
        outputs,
        end_time: nowMs(),
      }),
    );
  }

  // ── Tool calls (child runs) ───────────────────────────────────────────────

  /**
   * Create a child "tool" run under the session's root run.
   * Multiple calls for the same session create **sibling** runs (parallel
   * tool calls) — they all share the same `parent_run_id`.
   */
  async startToolCall(
    session: SessionTrace,
    toolName: string,
    inputs: Record<string, unknown>,
    toolRunId?: string,
  ): Promise<ToolRunTrace> {
    const id = toolRunId ?? uuid();
    const startTime = nowMs();

    if (!this.client || !this.config) {
      return {
        toolRunId: id,
        parentRunId: session.rootRunId,
        toolName,
        startTime,
      };
    }

    await this._safeCall("startToolCall", () =>
      this.client!.createRun({
        id,
        name: toolName,
        run_type: "tool",
        project_name: this.config!.project,
        inputs,
        parent_run_id: session.rootRunId,
        start_time: startTime,
      }),
    );

    return { toolRunId: id, parentRunId: session.rootRunId, toolName, startTime };
  }

  /**
   * Complete a previously started tool-call run.
   */
  async endToolCall(
    toolRun: ToolRunTrace,
    outputs: Record<string, unknown>,
    error?: string,
  ): Promise<TracedToolResult> {
    const endTime = nowMs();

    if (!this.client) {
      return { toolRunId: toolRun.toolRunId, endTime, outputs, error };
    }

    const updatePayload: Parameters<Client["updateRun"]>[1] = {
      outputs,
      end_time: endTime,
    };

    if (error !== undefined) {
      updatePayload.error = error;
    }

    await this._safeCall("endToolCall", () =>
      this.client!.updateRun(toolRun.toolRunId, updatePayload),
    );

    return { toolRunId: toolRun.toolRunId, endTime, outputs, error };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Wraps every LangSmith API call so that network failures never surface to
   * Pi as unhandled rejections.
   */
  private async _safeCall<T>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.warnFn(`[langsmith-tracer] ${label} failed (ignored): ${msg}`);
      return undefined;
    }
  }
}
