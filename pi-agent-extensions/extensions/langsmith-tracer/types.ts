/**
 * LangSmith Tracer Extension - Types
 */

/** Config passed at extension initialisation */
export interface LangSmithTracerConfig {
  /** LangSmith API key. Defaults to process.env.LANGSMITH_API_KEY */
  apiKey?: string;
  /** LangSmith project name. Defaults to process.env.LANGSMITH_PROJECT ?? "pi-agent" */
  project?: string;
  /** Base URL for LangSmith API. Defaults to https://api.smith.langchain.com */
  apiUrl?: string;
}

/** Resolved, validated config (after env vars applied) */
export interface ResolvedConfig {
  apiKey: string;
  project: string;
  apiUrl: string;
}

/** Represents a single active Pi session being traced */
export interface SessionTrace {
  /** UUID of the root LangSmith run */
  rootRunId: string;
  /** When the session started (ms since epoch) */
  startTime: number;
  /** The task / initial prompt that seeded the session */
  task: string;
}

/** Represents a single tool-call run (child of the session root) */
export interface ToolRunTrace {
  /** UUID of this tool run */
  toolRunId: string;
  /** UUID of the parent (root) run */
  parentRunId: string;
  /** Name of the tool */
  toolName: string;
  /** When the tool call started */
  startTime: number;
}

/** Result returned by a traced tool execution */
export interface TracedToolResult {
  toolRunId: string;
  endTime: number;
  outputs: Record<string, unknown>;
  error?: string;
}

/** Minimal subset of the Pi ExtensionAPI we depend on for tracing hooks */
export interface PiExtensionAPISubset {
  on(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
}
