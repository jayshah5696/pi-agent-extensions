import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, SessionManager, keyHint } from "@earendil-works/pi-coding-agent";
import {
  CancellableLoader,
  Container,
  Key,
  SelectList,
  type SelectItem,
  Spacer,
  Text,
  matchesKey,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import {
  buildSessionPreview,
  buildSessionDescription,
  buildSessionLabel,
  buildSessionSearchEntries,
  calculateSessionPickerLayout,
  filterSessionEntries,
  parseLimit,
  type SessionInfoLike,
} from "./sessions.js";

const DEFAULT_VISIBLE = 5;
const SNIPPET_MAX = 60;

const isPrintable = (data: string): boolean => {
  if (data.length !== 1) return false;
  const code = data.charCodeAt(0);
  return code >= 32 && code !== 127;
};

const sortSessions = (sessions: SessionInfoLike[]): SessionInfoLike[] =>
  [...sessions].sort((a, b) => b.modified.getTime() - a.modified.getTime());

const extractTextContent = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const record = part as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") return record.text;
      if (record.type === "thinking" && typeof record.thinking === "string") return `[thinking] ${record.thinking}`;
      if (record.type === "toolCall" && typeof record.name === "string") return `[tool call] ${record.name}`;
      if (record.type === "image") return "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
};

const buildPreviewFromSessionFile = (session: SessionInfoLike): string[] => {
  try {
    const manager = SessionManager.open(session.path);
    const parts = manager.getEntries().flatMap((entry) => {
      if (entry.type === "message") {
        const message = entry.message as Record<string, unknown>;
        const role = typeof message.role === "string" ? message.role : "message";
        const text = extractTextContent(message.content);
        if (role === "bashExecution") {
          const command = typeof message.command === "string" ? message.command : "";
          const output = typeof message.output === "string" ? message.output : "";
          return [`bash: ${command}`, output].filter(Boolean);
        }
        return [`${role}:`, text].filter(Boolean);
      }
      if (entry.type === "compaction") return ["compaction:", entry.summary];
      if (entry.type === "branch_summary") return ["branch summary:", entry.summary];
      if (entry.type === "model_change") return [`model: ${entry.provider}/${entry.modelId}`];
      return [];
    });

    return buildSessionPreview({ ...session, allMessagesText: parts.join("\n\n") });
  } catch {
    return buildSessionPreview(session);
  }
};

const formatPlainLine = (session: SessionInfoLike): string => {
  const label = buildSessionLabel(session);
  const description = buildSessionDescription(session, SNIPPET_MAX);
  return `${label}\t${description}`;
};

async function listSessions(ctx: ExtensionCommandContext): Promise<SessionInfoLike[] | null> {
  if (!ctx.hasUI) {
    const sessions = await SessionManager.list(ctx.cwd);
    return sortSessions(sessions);
  }

  let loadError: string | undefined;
  const sessions = await ctx.ui.custom<SessionInfoLike[] | null>((tui, theme, _kb, done) => {
    const container = new Container();
    const borderColor = (text: string) => theme.fg("border", text);

    const loader = new CancellableLoader(
      tui,
      (text) => theme.fg("accent", text),
      (text) => theme.fg("muted", text),
      "Loading sessions...",
    );

    let settled = false;
    const finish = (result: SessionInfoLike[] | null) => {
      if (settled) return;
      settled = true;
      done(result);
    };

    loader.onAbort = () => finish(null);

    container.addChild(new DynamicBorder(borderColor));
    container.addChild(loader);
    container.addChild(new Spacer(1));
    container.addChild(new Text(keyHint("tui.select.cancel", "cancel"), 1, 0));
    container.addChild(new Spacer(1));
    container.addChild(new DynamicBorder(borderColor));

    const load = async () => {
      try {
        const results = await SessionManager.list(ctx.cwd, undefined, (loaded, total) => {
          if (total > 0) {
            loader.setMessage(`Loading sessions (${loaded}/${total})...`);
          }
        });
        finish(sortSessions(results));
      } catch (error) {
        loadError = error instanceof Error ? error.message : "Unknown error";
        finish(null);
      }
    };

    void load();

    return {
      render: (width) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data) => {
        loader.handleInput(data);
        tui.requestRender();
      },
    };
  });

  if (loadError) {
    ctx.ui.notify(`Failed to load sessions: ${loadError}`, "error");
  }

  return sessions;
}

async function showSessionPicker(
  ctx: ExtensionCommandContext,
  sessions: SessionInfoLike[],
  maxVisible: number,
): Promise<SessionInfoLike | null> {
  const sorted = sessions;
  const entries = buildSessionSearchEntries(sorted);
  const sessionByPath = new Map(sorted.map((session) => [session.path, session]));

  return ctx.ui.custom<SessionInfoLike | null>((tui, theme, _kb, done) => {
    let filter = "";
    let selectList: SelectList;
    let selectedSession = sorted[0] ?? null;
    let previewLines = selectedSession ? buildSessionPreview(selectedSession) : ["No session selected"];
    let previewOffset = 0;
    let previewSeq = 0;
    const previewCache = new Map<string, string[]>();
    const container = new Container();

    const buildItems = (current: typeof entries): SelectItem[] =>
      current.map((entry) => ({
        value: entry.session.path,
        label: buildSessionLabel(entry.session),
        description: buildSessionDescription(entry.session, SNIPPET_MAX),
      }));

    const loadPreview = (session: SessionInfoLike | null) => {
      previewOffset = 0;
      if (!session) {
        previewLines = ["No session selected"];
        return;
      }

      const cached = previewCache.get(session.path);
      if (cached) {
        previewLines = cached;
        return;
      }

      if (session.allMessagesText) {
        const built = buildSessionPreview(session);
        previewCache.set(session.path, built);
        previewLines = built;
        return;
      }

      const seq = ++previewSeq;
      previewLines = [buildSessionLabel(session), "", "Loading preview..."];
      queueMicrotask(() => {
        const built = buildPreviewFromSessionFile(session);
        if (seq !== previewSeq || selectedSession?.path !== session.path) return;
        previewCache.set(session.path, built);
        previewLines = built;
        tui.requestRender();
      });
    };

    const rebuild = () => {
      const filtered = filterSessionEntries(entries, filter);
      const items = buildItems(filtered);
      const visible = Math.max(1, Math.min(maxVisible, Math.max(items.length, 1)));

      selectList = new SelectList(items, visible, {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", text),
        description: (text) => theme.fg("muted", text),
        scrollInfo: (text) => theme.fg("dim", text),
        noMatch: () => theme.fg("warning", "  No matching sessions"),
      });

      selectList.onSelect = (item) => {
        const session = sessionByPath.get(item.value) ?? null;
        done(session);
      };
      selectList.onCancel = () => done(null);
      selectList.onSelectionChange = (item) => {
        selectedSession = sessionByPath.get(item.value) ?? null;
        loadPreview(selectedSession);
        tui.requestRender();
      };

      selectedSession = items.length > 0 ? sessionByPath.get(selectList.getSelectedItem()?.value ?? "") ?? null : null;
      loadPreview(selectedSession);

      const filterLine = filter.length
        ? `${theme.fg("muted", "Filter: ")}${theme.fg("text", filter)}`
        : `${theme.fg("muted", "Filter: ")}${theme.fg("dim", "type to filter")}`;

      container.clear();
      container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
      container.addChild(new Text(theme.fg("accent", theme.bold("Sessions")), 1, 0));
      container.addChild(new Text(filterLine, 1, 0));
      container.addChild(selectList);
      container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter open • esc cancel"), 1, 0));
      container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    };

    rebuild();

    return {
      render: (width) => {
        const layout = calculateSessionPickerLayout(width);
        const left = container.render(layout.listWidth);
        if (!layout.showPreview) return left;

        const previewHeight = Math.max(1, (tui.height ?? 24) - left.length - 3);
        const maxPreviewOffset = Math.max(0, previewLines.length - previewHeight);
        previewOffset = Math.min(previewOffset, maxPreviewOffset);
        const visiblePreview = previewLines.slice(previewOffset, previewOffset + previewHeight);
        const scrollInfo = maxPreviewOffset > 0
          ? theme.fg("dim", ` (${previewOffset + 1}-${Math.min(previewOffset + previewHeight, previewLines.length)}/${previewLines.length})`)
          : "";
        const preview = [
          theme.fg("accent", theme.bold("Preview")) + scrollInfo,
          ...visiblePreview.map((line) => theme.fg("muted", truncateToWidth(line, layout.previewWidth))),
          theme.fg("dim", "PgUp/PgDn preview scroll"),
        ];

        return [...left, "", ...preview];
      },
      invalidate: () => {
        rebuild();
        container.invalidate();
      },
      handleInput: (data) => {
        if (matchesKey(data, Key.backspace) || matchesKey(data, Key.delete)) {
          if (filter.length > 0) {
            filter = filter.slice(0, -1);
            rebuild();
            tui.requestRender();
          }
          return;
        }

        if (isPrintable(data)) {
          filter += data;
          rebuild();
          tui.requestRender();
          return;
        }

        const pageStep = Math.max(4, maxVisible);
        if (matchesKey(data, Key.pageUp)) {
          previewOffset = Math.max(0, previewOffset - pageStep);
          tui.requestRender();
          return;
        }
        if (matchesKey(data, Key.pageDown)) {
          previewOffset += pageStep;
          tui.requestRender();
          return;
        }

        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

async function runSessionsCommand(args: string | undefined, ctx: ExtensionCommandContext): Promise<void> {
  const limit = parseLimit(args, DEFAULT_VISIBLE);
  const sessions = await listSessions(ctx);

  if (!sessions || sessions.length === 0) {
    if (ctx.hasUI) {
      ctx.ui.notify("No sessions found for this project.", "info");
    } else {
      console.log("No sessions found for this project.");
    }
    return;
  }

  if (!ctx.hasUI) {
    for (const session of sessions) {
      console.log(formatPlainLine(session));
    }
    return;
  }

  const selection = await showSessionPicker(ctx, sessions, limit);
  if (!selection) return;

  const result = await ctx.switchSession(selection.path);
  if (result.cancelled) {
    ctx.ui.notify("Session switch cancelled.", "info");
  }
}

export default function sessionsExtension(pi: ExtensionAPI) {
  pi.registerCommand("sessions", {
    description: "Pick a session from the current project",
    handler: async (args, ctx) => {
      await runSessionsCommand(args, ctx);
    },
  });
}
