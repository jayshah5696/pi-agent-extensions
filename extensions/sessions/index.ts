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
  visibleWidth,
} from "@earendil-works/pi-tui";
import {
  buildPreviewError,
  buildSessionPreview,
  buildSessionDescription,
  buildSessionLabel,
  buildSessionSearchEntries,
  filterSessionEntries,
  getSessionPaneLayout,
  parseLimit,
  type SessionPreview,
  type SessionInfoLike,
} from "./sessions.js";

const DEFAULT_VISIBLE = 12;
const SNIPPET_MAX = 60;
const PREVIEW_LOAD_DEBOUNCE_MS = 50;
const OVERLAY_FILL_LINES = 120;

const isPrintable = (data: string): boolean => {
  if (data.length !== 1) return false;
  const code = data.charCodeAt(0);
  return code >= 32 && code !== 127;
};

const sortSessions = (sessions: SessionInfoLike[]): SessionInfoLike[] =>
  [...sessions].sort((a, b) => b.modified.getTime() - a.modified.getTime());

const formatPlainLine = (session: SessionInfoLike): string => {
  const label = buildSessionLabel(session);
  const description = buildSessionDescription(session, SNIPPET_MAX);
  return `${label}\t${description}`;
};

const padAnsiRight = (text: string, width: number): string => {
  const truncated = truncateToWidth(text, width, "");
  return `${truncated}${" ".repeat(Math.max(0, width - visibleWidth(truncated)))}`;
};

const fillOverlayLines = (lines: string[], width: number): string[] => {
  const padded = lines.map((line) => padAnsiRight(line, width));
  while (padded.length < OVERLAY_FILL_LINES) {
    padded.push(" ".repeat(width));
  }
  return padded;
};

const renderPreview = (
  preview: SessionPreview | undefined,
  width: number,
  theme: { fg: (color: any, text: string) => string; bold: (text: string) => string },
  maxLines: number,
): string[] => {
  const lines: string[] = [];
  if (!preview) {
    lines.push(theme.fg("muted", "Preview"));
    lines.push(theme.fg("dim", "Loading selected session..."));
  } else {
    const title = preview.error ? theme.fg("error", preview.title) : theme.fg("accent", theme.bold(preview.title));
    lines.push(truncateToWidth(title, width, ""));
    lines.push(theme.fg("dim", truncateToWidth(preview.subtitle, width, "")));
    lines.push(theme.fg("border", "─".repeat(Math.max(0, width))));

    for (const line of preview.lines) {
      const isLabel = /^[a-zA-Z][\w:-]*:$/.test(line);
      const styled = isLabel ? theme.fg("warning", line) : theme.fg("text", line);
      lines.push(truncateToWidth(styled, width, ""));
    }
  }

  return lines.slice(0, maxLines).map((line) => padAnsiRight(line, width));
};

const loadSessionPreview = async (session: SessionInfoLike): Promise<SessionPreview> => {
  try {
    const manager = SessionManager.open(session.path);
    const context = manager.buildSessionContext();
    return buildSessionPreview(session, context.messages as any[]);
  } catch (error) {
    return buildPreviewError(session, error);
  }
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

  return ctx.ui.custom<SessionInfoLike | null>((tui, theme, kb, done) => {
    let filter = "";
    let selectList: SelectList;
    let filteredEntries = entries;
    let selectedPath = sorted[0]?.path ?? "";
    const container = new Container();
    const previewCache = new Map<string, SessionPreview>();
    let activePreview: SessionPreview | undefined;
    let previewTimer: ReturnType<typeof setTimeout> | undefined;
    let previewSeq = 0;

    const previewKey = (session: SessionInfoLike): string => `${session.path}:${session.modified.getTime()}`;

    const setSelectedPath = (path: string | undefined) => {
      if (!path || path === selectedPath) return;
      selectedPath = path;
      schedulePreviewLoad();
    };

    const schedulePreviewLoad = () => {
      const session = sessionByPath.get(selectedPath);
      if (!session) {
        activePreview = undefined;
        return;
      }

      const key = previewKey(session);
      const cached = previewCache.get(key);
      if (cached) {
        activePreview = cached;
        return;
      }

      activePreview = {
        title: buildSessionLabel(session),
        subtitle: `${session.modified.toLocaleString()} · loading preview`,
        lines: ["Loading selected session..."],
      };

      if (previewTimer) clearTimeout(previewTimer);
      const seq = ++previewSeq;
      previewTimer = setTimeout(() => {
        void loadSessionPreview(session).then((preview) => {
          if (seq !== previewSeq || selectedPath !== session.path) return;
          previewCache.set(key, preview);
          activePreview = preview;
          tui.requestRender();
        });
      }, PREVIEW_LOAD_DEBOUNCE_MS);
    };

    const moveByPage = (delta: number) => {
      if (filteredEntries.length === 0) return;
      const currentIndex = Math.max(
        0,
        filteredEntries.findIndex((entry) => entry.session.path === selectedPath),
      );
      const nextIndex = Math.max(0, Math.min(filteredEntries.length - 1, currentIndex + delta));
      selectList.setSelectedIndex(nextIndex);
      setSelectedPath(filteredEntries[nextIndex]?.session.path);
    };

    const buildItems = (current: typeof entries): SelectItem[] =>
      current.map((entry) => ({
        value: entry.session.path,
        label: buildSessionLabel(entry.session),
        description: buildSessionDescription(entry.session, SNIPPET_MAX),
      }));

    const rebuild = () => {
      filteredEntries = filterSessionEntries(entries, filter);
      const items = buildItems(filteredEntries);
      const visible = Math.max(1, Math.min(maxVisible, Math.max(items.length, 1)));

      selectList = new SelectList(items, visible, {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", text),
        description: (text) => theme.fg("muted", text),
        scrollInfo: (text) => theme.fg("dim", text),
        noMatch: () => theme.fg("warning", "  No matching sessions"),
      });

      const selectedIndex = filteredEntries.findIndex((entry) => entry.session.path === selectedPath);
      if (selectedIndex >= 0) {
        selectList.setSelectedIndex(selectedIndex);
      } else {
        selectedPath = filteredEntries[0]?.session.path ?? "";
        selectList.setSelectedIndex(0);
        schedulePreviewLoad();
      }

      selectList.onSelect = (item) => {
        const session = sessionByPath.get(item.value) ?? null;
        done(session);
      };
      selectList.onCancel = () => done(null);
      selectList.onSelectionChange = (item) => {
        setSelectedPath(item.value);
      };

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
    schedulePreviewLoad();

    return {
      render: (width) => {
        const layout = getSessionPaneLayout(width);
        if (layout.mode === "single") {
          return fillOverlayLines(container.render(width), width);
        }

        const leftLines = container.render(layout.listWidth).map((line) => padAnsiRight(line, layout.listWidth));
        const previewLines = renderPreview(activePreview, layout.previewWidth, theme, Math.max(leftLines.length, maxVisible + 6));
        const height = Math.max(leftLines.length, previewLines.length);
        const lines: string[] = [];

        for (let i = 0; i < height; i++) {
          const left = leftLines[i] ?? " ".repeat(layout.listWidth);
          const right = previewLines[i] ?? " ".repeat(layout.previewWidth);
          lines.push(`${left}${theme.fg("border", " │ ")}${padAnsiRight(right, layout.previewWidth)}`);
        }

        return fillOverlayLines(lines, width);
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

        if (kb.matches(data, "tui.select.pageUp")) {
          moveByPage(-maxVisible);
          tui.requestRender();
          return;
        }

        if (kb.matches(data, "tui.select.pageDown")) {
          moveByPage(maxVisible);
          tui.requestRender();
          return;
        }

        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  }, {
    overlay: true,
    overlayOptions: {
      anchor: "top-left",
      row: 0,
      col: 0,
      width: "100%",
      maxHeight: "100%",
      margin: 0,
    },
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
