import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, SessionManager, keyHint } from "@mariozechner/pi-coding-agent";
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
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
import {
  buildPreviewError,
  buildSessionDescription,
  buildSessionLabel,
  buildSessionPreview,
  buildSessionSearchEntries,
  filterSessionEntries,
  getSessionPaneLayout,
  parseLimit,
  type SessionInfoLike,
  type SessionPreview,
} from "./sessions.js";

const DEFAULT_VISIBLE = 12;
const SNIPPET_MAX = 60;
const PREVIEW_LOAD_DEBOUNCE_MS = 50;

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

const themeText = (
  theme: { fg: (color: any, text: string) => string; bold: (text: string) => string },
  kind: "title" | "subtitle" | "rule" | "role" | "error" | "muted" | "text",
  text: string,
): string => {
  if (kind === "title") return theme.fg("accent", theme.bold(text));
  if (kind === "subtitle") return theme.fg("dim", text);
  if (kind === "rule") return theme.fg("border", text);
  if (kind === "role") return theme.fg("warning", theme.bold(text));
  if (kind === "error") return theme.fg("error", text);
  if (kind === "muted") return theme.fg("muted", text);
  return theme.fg("text", text);
};

const wrapPreviewLine = (
  line: string,
  width: number,
  theme: { fg: (color: any, text: string) => string; bold: (text: string) => string },
): string[] => {
  const isRole = /^[A-Za-z][\w :-]*:$/.test(line);
  const styled = isRole ? themeText(theme, "role", line) : themeText(theme, "text", line);
  return wrapTextWithAnsi(styled, Math.max(1, width));
};

const renderPreview = (
  preview: SessionPreview | undefined,
  width: number,
  height: number,
  scrollOffset: number,
  theme: { fg: (color: any, text: string) => string; bold: (text: string) => string },
): { lines: string[]; totalLines: number; maxScroll: number } => {
  const raw: string[] = [];

  if (!preview) {
    raw.push(themeText(theme, "title", "Preview"));
    raw.push(themeText(theme, "subtitle", "Loading selected session…"));
  } else {
    raw.push(themeText(theme, preview.error ? "error" : "title", preview.title));
    raw.push(themeText(theme, "subtitle", preview.subtitle));
    raw.push(themeText(theme, "rule", "─".repeat(Math.max(0, width))));

    for (const line of preview.lines) {
      if (line === "") {
        raw.push("");
      } else {
        raw.push(...wrapPreviewLine(line, width, theme));
      }
    }
  }

  const maxScroll = Math.max(0, raw.length - height);
  const boundedOffset = Math.max(0, Math.min(scrollOffset, maxScroll));
  const visible = raw.slice(boundedOffset, boundedOffset + height).map((line) => padAnsiRight(line, width));
  while (visible.length < height) visible.push(" ".repeat(width));

  return { lines: visible, totalLines: raw.length, maxScroll };
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
    let previewScrollOffset = 0;
    const previewCache = new Map<string, SessionPreview>();
    let activePreview: SessionPreview | undefined;
    let previewTimer: ReturnType<typeof setTimeout> | undefined;
    let previewSeq = 0;

    const previewKey = (session: SessionInfoLike): string => `${session.path}:${session.modified.getTime()}`;

    const schedulePreviewLoad = () => {
      previewScrollOffset = 0;
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
        lines: ["Loading selected session…"],
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

    const setSelectedPath = (path: string | undefined) => {
      if (!path || path === selectedPath) return;
      selectedPath = path;
      schedulePreviewLoad();
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
      selectList.onSelectionChange = (item) => setSelectedPath(item.value);
    };

    const renderSinglePane = (width: number): string[] => {
      const container = new Container();
      const filterLine = filter.length
        ? `${theme.fg("muted", "Filter: ")}${theme.fg("text", filter)}`
        : `${theme.fg("muted", "Filter: ")}${theme.fg("dim", "type to filter")}`;

      container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
      container.addChild(new Text(theme.fg("accent", theme.bold("Sessions")), 1, 0));
      container.addChild(new Text(filterLine, 1, 0));
      container.addChild(selectList);
      container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter open • esc cancel"), 1, 0));
      container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
      return container.render(width);
    };

    const buildTopBorder = (listWidth: number, previewWidth: number): string => {
      const leftTitle = " Sessions ";
      const rightTitle = " Preview ";
      const left = `┌─${leftTitle}${"─".repeat(Math.max(0, listWidth - leftTitle.length - 2))}`;
      const right = `${rightTitle}${"─".repeat(Math.max(0, previewWidth - rightTitle.length - 1))}┐`;
      return `${theme.fg("border", left)}${theme.fg("border", "─┬─")}${theme.fg("border", right)}`;
    };

    const buildBottomBorder = (listWidth: number, previewWidth: number, previewStats: string): string => {
      const leftHelp = " ↑↓ list • type filter ";
      const rightHelp = previewStats || " pgup/pgdn preview • esc cancel • enter open ";
      const left = `└─${leftHelp}${"─".repeat(Math.max(0, listWidth - leftHelp.length - 2))}`;
      const right = `${rightHelp}${"─".repeat(Math.max(0, previewWidth - rightHelp.length - 1))}┘`;
      return `${theme.fg("border", left)}${theme.fg("border", "─┴─")}${theme.fg("border", right)}`;
    };

    const renderSplitPane = (width: number): string[] => {
      const layout = getSessionPaneLayout(width);
      const termRows = Math.max(12, tui.terminal?.rows ?? 24);
      const contentHeight = Math.max(8, termRows - 2);
      const filterLine = filter.length
        ? `${theme.fg("muted", "Filter: ")}${theme.fg("text", filter)}`
        : `${theme.fg("muted", "Filter: ")}${theme.fg("dim", "type to filter")}`;
      const listHeight = Math.max(1, contentHeight - 1);

      // SelectList height is fixed at creation time; recreate it to use the current full-window height.
      const items = buildItems(filteredEntries);
      selectList = new SelectList(items, Math.max(listHeight, Math.min(maxVisible, Math.max(items.length, 1))), {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", text),
        description: (text) => theme.fg("muted", text),
        scrollInfo: (text) => theme.fg("dim", text),
        noMatch: () => theme.fg("warning", "  No matching sessions"),
      });
      const selectedIndex = filteredEntries.findIndex((entry) => entry.session.path === selectedPath);
      selectList.setSelectedIndex(selectedIndex >= 0 ? selectedIndex : 0);
      selectList.onSelect = (item) => done(sessionByPath.get(item.value) ?? null);
      selectList.onCancel = () => done(null);
      selectList.onSelectionChange = (item) => setSelectedPath(item.value);

      const leftLines = [filterLine, ...selectList.render(layout.listWidth)].slice(0, contentHeight);
      while (leftLines.length < contentHeight) leftLines.push("");

      const renderedPreview = renderPreview(activePreview, layout.previewWidth, contentHeight, previewScrollOffset, theme);
      previewScrollOffset = Math.min(previewScrollOffset, renderedPreview.maxScroll);
      const previewStats = renderedPreview.maxScroll > 0
        ? ` ${previewScrollOffset + 1}-${Math.min(previewScrollOffset + contentHeight, renderedPreview.totalLines)}/${renderedPreview.totalLines} • pgup/pgdn scroll `
        : " esc cancel • enter open ";

      const lines = [buildTopBorder(layout.listWidth, layout.previewWidth)];
      for (let i = 0; i < contentHeight; i++) {
        const left = padAnsiRight(leftLines[i] ?? "", layout.listWidth);
        const right = renderedPreview.lines[i] ?? " ".repeat(layout.previewWidth);
        lines.push(`${left}${theme.fg("border", " │ ")}${padAnsiRight(right, layout.previewWidth)}`);
      }
      lines.push(buildBottomBorder(layout.listWidth, layout.previewWidth, previewStats));
      return lines.map((line) => truncateToWidth(line, width, "", true));
    };

    rebuild();
    schedulePreviewLoad();

    return {
      render: (width) => {
        const layout = getSessionPaneLayout(width);
        if (layout.mode === "single") return renderSinglePane(width);
        return renderSplitPane(width);
      },
      invalidate: () => {
        previewCache.clear();
        rebuild();
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

        const currentLayout = getSessionPaneLayout(tui.terminal?.columns ?? 80);
        if (currentLayout.mode === "split") {
          const pageSize = Math.max(4, (tui.terminal?.rows ?? 24) - 4);
          if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("d"))) {
            previewScrollOffset += pageSize;
            tui.requestRender();
            return;
          }
          if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("u"))) {
            previewScrollOffset = Math.max(0, previewScrollOffset - pageSize);
            tui.requestRender();
            return;
          }
        }

        if (kb.matches(data, "tui.select.pageUp")) {
          const currentIndex = Math.max(0, filteredEntries.findIndex((entry) => entry.session.path === selectedPath));
          const nextIndex = Math.max(0, currentIndex - maxVisible);
          selectList.setSelectedIndex(nextIndex);
          setSelectedPath(filteredEntries[nextIndex]?.session.path);
          tui.requestRender();
          return;
        }

        if (kb.matches(data, "tui.select.pageDown")) {
          const currentIndex = Math.max(0, filteredEntries.findIndex((entry) => entry.session.path === selectedPath));
          const nextIndex = Math.min(filteredEntries.length - 1, currentIndex + maxVisible);
          selectList.setSelectedIndex(nextIndex);
          setSelectedPath(filteredEntries[nextIndex]?.session.path);
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
