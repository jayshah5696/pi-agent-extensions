export interface SessionInfoLike {
  id: string;
  name?: string;
  cwd: string;
  modified: Date;
  firstMessage: string;
  path: string;
  messageCount?: number;
}

export type PreviewContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image"; mimeType?: string }
      | { type: "toolCall"; name: string; arguments?: Record<string, unknown> }
      | { type: "thinking"; thinking?: string; redacted?: boolean }
    >;

export interface PreviewMessageLike {
  role: string;
  content?: PreviewContent;
  toolName?: string;
  isError?: boolean;
  command?: string;
  output?: string;
  summary?: string;
}

export interface SessionPreview {
  title: string;
  subtitle: string;
  lines: string[];
  error?: string;
}

export interface PaneLayout {
  mode: "single" | "split";
  listWidth: number;
  previewWidth: number;
}

export function parseLimit(args: string | undefined, defaultLimit = 5): number {
  if (!args) return defaultLimit;
  const parsed = Number.parseInt(args.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultLimit;
  return parsed;
}

const pad = (value: number): string => value.toString().padStart(2, "0");

export function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function buildSessionLabel(session: SessionInfoLike): string {
  const trimmedName = session.name?.trim();
  if (trimmedName) return trimmedName;
  return session.id.length > 8 ? session.id.slice(0, 8) : session.id;
}

const normalizeSnippet = (text: string, maxLength: number): string => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const fallback = cleaned.length > 0 ? cleaned : "No messages";
  if (maxLength < 1) return "";
  if (fallback.length <= maxLength) return fallback;
  if (maxLength === 1) return "…";
  return `${fallback.slice(0, maxLength - 1)}…`;
};

export function buildSessionDescription(session: SessionInfoLike, snippetMax = 60): string {
  const snippet = normalizeSnippet(session.firstMessage ?? "", snippetMax);
  return `${formatTimestamp(session.modified)} • ${snippet} — ${session.cwd}`;
}

export interface SessionSearchEntry {
  session: SessionInfoLike;
  searchText: string;
}

export const buildSearchText = (session: SessionInfoLike): string =>
  [session.name?.trim() ?? "", session.id, session.cwd, session.firstMessage ?? ""]
    .join(" ")
    .toLowerCase();

export function buildSessionSearchEntries(sessions: SessionInfoLike[]): SessionSearchEntry[] {
  return sessions.map((session) => ({ session, searchText: buildSearchText(session) }));
}

export function filterSessionEntries(entries: SessionSearchEntry[], filter: string): SessionSearchEntry[] {
  const normalized = filter.trim().toLowerCase();
  if (!normalized) return entries;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return entries;

  return entries.filter((entry) => tokens.every((token) => entry.searchText.includes(token)));
}

export function filterSessionInfos(sessions: SessionInfoLike[], filter: string): SessionInfoLike[] {
  return filterSessionEntries(buildSessionSearchEntries(sessions), filter).map((entry) => entry.session);
}

export function getSessionPaneLayout(width: number): PaneLayout {
  if (width < 100) {
    return { mode: "single", listWidth: width, previewWidth: 0 };
  }

  const separatorWidth = 3;
  const available = Math.max(0, width - separatorWidth);
  let listRatio = 0.45;
  if (width >= 180) {
    listRatio = 0.34;
  } else if (width >= 140) {
    listRatio = 0.38;
  }

  const listWidth = Math.max(40, Math.min(64, Math.floor(available * listRatio)));
  return {
    mode: "split",
    listWidth,
    previewWidth: Math.max(0, available - listWidth),
  };
}

const stripAnsi = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, "");

export function visiblePlainWidth(text: string): number {
  return Array.from(stripAnsi(text)).length;
}

export function truncatePlain(text: string, width: number, ellipsis = "…"): string {
  if (width <= 0) return "";
  if (visiblePlainWidth(text) <= width) return text;
  if (width <= visiblePlainWidth(ellipsis)) return ellipsis.slice(0, width);
  return `${Array.from(stripAnsi(text)).slice(0, width - visiblePlainWidth(ellipsis)).join("")}${ellipsis}`;
}

export function padPlainRight(text: string, width: number): string {
  const truncated = truncatePlain(text, width, "");
  return `${truncated}${" ".repeat(Math.max(0, width - visiblePlainWidth(truncated)))}`;
}

function previewContentToText(content: PreviewContent | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;

  return content
    .map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "image") return `[image${part.mimeType ? `: ${part.mimeType}` : ""}]`;
      if (part.type === "toolCall") return `[tool call: ${part.name}]`;
      if (part.type === "thinking") {
        if (part.redacted) return "[thinking redacted]";
        return part.thinking ? `[thinking] ${part.thinking}` : "[thinking]";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function previewMessageLabel(message: PreviewMessageLike): string {
  if (message.role === "toolResult") {
    return message.isError ? `tool error${message.toolName ? `:${message.toolName}` : ""}` : `tool${message.toolName ? `:${message.toolName}` : ""}`;
  }
  if (message.role === "bashExecution") return "bash";
  if (message.role === "compactionSummary") return "summary";
  if (message.role === "branchSummary") return "branch";
  if (message.role === "custom") return "custom";
  return message.role;
}

function previewMessageText(message: PreviewMessageLike): string {
  if (message.role === "bashExecution") {
    const command = message.command ? `$ ${message.command}` : "$";
    return message.output ? `${command}\n${message.output}` : command;
  }
  if (message.summary) return message.summary;
  return previewContentToText(message.content);
}

export function buildSessionPreview(
  session: SessionInfoLike,
  messages: PreviewMessageLike[],
  options: { maxMessages?: number } = {},
): SessionPreview {
  const maxMessages = options.maxMessages ?? 80;
  const lines: string[] = [];
  const omitted = Math.max(0, messages.length - maxMessages);
  const visibleMessages = omitted > 0 ? messages.slice(-maxMessages) : messages;

  if (omitted > 0) {
    lines.push(`... ${omitted} earlier messages omitted`);
    lines.push("");
  }

  for (const message of visibleMessages) {
    const label = previewMessageLabel(message);
    const text = previewMessageText(message).replace(/\s+$/g, "");
    if (!text.trim()) continue;

    lines.push(`${label}:`);
    for (const line of text.split(/\r?\n/)) {
      const normalized = line.replace(/\s+/g, " ").trim();
      if (normalized) lines.push(`  ${normalized}`);
    }
    lines.push("");
  }

  if (lines.at(-1) === "") lines.pop();

  const messageCount = session.messageCount ?? messages.length;
  return {
    title: buildSessionLabel(session),
    subtitle: `${formatTimestamp(session.modified)} · ${messageCount} messages`,
    lines: lines.length > 0 ? lines : ["No previewable messages."],
  };
}

export function buildPreviewError(session: SessionInfoLike, error: unknown): SessionPreview {
  const message = error instanceof Error ? error.message : String(error);
  return {
    title: buildSessionLabel(session),
    subtitle: `${formatTimestamp(session.modified)} · preview unavailable`,
    lines: [`Failed to load preview: ${message}`],
    error: message,
  };
}
