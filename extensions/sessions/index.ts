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
  buildSessionDescription,
  buildSessionLabel,
  buildSessionSearchEntries,
  filterSessionEntries,
  parseLimit,
  type SessionInfoLike,
  formatPreviewEntries,
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

const buildTopBorder = (leftWidth: number, rightWidth: number, theme: any): string => {
  const leftPrefix = "┌─";
  const leftTitle = " Sessions ";
  const leftPad = leftWidth - leftPrefix.length - leftTitle.length;
  const leftRaw = theme.fg("border", leftPrefix) + theme.fg("accent", theme.bold(leftTitle)) + theme.fg("border", "─".repeat(Math.max(0, leftPad)));
  const leftPart = truncateToWidth(leftRaw, leftWidth, "", true);

  const mid = theme.fg("border", "─┬─");

  const rightPrefix = " Preview ";
  const rightPad = rightWidth - rightPrefix.length - 2;
  const rightRaw = theme.fg("accent", theme.bold(rightPrefix)) + theme.fg("border", "─".repeat(Math.max(0, rightPad))) + theme.fg("border", "─┐");
  const rightPart = truncateToWidth(rightRaw, rightWidth, "", true);

  return leftPart + mid + rightPart;
};

const buildBottomBorder = (leftWidth: number, rightWidth: number, theme: any): string => {
  const leftPrefix = "└─";
  const leftHelp = " ↑↓ list • pgup/pgdn scroll ";
  const leftPad = leftWidth - leftPrefix.length - leftHelp.length;
  const leftRaw = theme.fg("border", leftPrefix) + theme.fg("dim", leftHelp) + theme.fg("border", "─".repeat(Math.max(0, leftPad)));
  const leftPart = truncateToWidth(leftRaw, leftWidth, "", true);

  const mid = theme.fg("border", "─┴─");

  const rightHelp = " esc cancel • enter open ";
  const rightPad = rightWidth - rightHelp.length - 2;
  const rightRaw = theme.fg("dim", rightHelp) + theme.fg("border", "─".repeat(Math.max(0, rightPad))) + theme.fg("border", "─┘");
  const rightPart = truncateToWidth(rightRaw, rightWidth, "", true);

  return leftPart + mid + rightPart;
};

const getPreviewLines = (sessionPath: string, rightWidth: number, theme: any): string[] => {
  try {
    const manager = SessionManager.open(sessionPath);
    const branch = manager.getBranch();
    return formatPreviewEntries(branch, rightWidth, theme);
  } catch (error) {
    return [theme.fg("warning", `Error loading session: ${error instanceof Error ? error.message : "Unknown error"}`)];
  }
};

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
    const container = new Container();

    let activeItem: SelectItem | null = null;
    let previewScrollOffset = 0;
    const previewCache = new Map<string, string[]>();

    const getCachedPreviewLines = (sessionPath: string, rightWidth: number): string[] => {
      const cacheKey = `${sessionPath}:${rightWidth}`;
      if (previewCache.has(cacheKey)) {
        return previewCache.get(cacheKey)!;
      }
      const lines = getPreviewLines(sessionPath, rightWidth, theme);
      previewCache.set(cacheKey, lines);
      return lines;
    };

    const buildItems = (current: typeof entries): SelectItem[] =>
      current.map((entry) => ({
        value: entry.session.path,
        label: buildSessionLabel(entry.session),
        description: buildSessionDescription(entry.session, SNIPPET_MAX),
      }));

    const rebuild = () => {
      const termWidth = tui.terminal.columns || 80;
      const termHeight = tui.terminal.rows || 24;

      const filtered = filterSessionEntries(entries, filter);
      const items = buildItems(filtered);

      const viewHeight = Math.max(8, termHeight - 2);
      let listHeight = maxVisible;
      if (termWidth >= 70) {
        listHeight = viewHeight - 2;
      }

      const visible = Math.max(1, Math.min(listHeight, Math.max(items.length, 1)));

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

      const newActive = selectList.getSelectedItem();
      if (newActive?.value !== activeItem?.value) {
        activeItem = newActive;
        previewScrollOffset = 0;
      }
    };

    rebuild();

    return {
      render: (width) => {
        if (width >= 70) {
          const termHeight = tui.terminal.rows || 24;
          const viewHeight = Math.max(8, termHeight - 2);

          const leftWidth = Math.max(30, Math.min(45, Math.floor(width * 0.35)));
          const divider = theme.fg("border", " │ ");
          const rightWidth = width - leftWidth - 3;

          const filterLine = filter.length
            ? `${theme.fg("muted", "Filter: ")}${theme.fg("text", filter)}`
            : `${theme.fg("muted", "Filter: ")}${theme.fg("dim", "type to filter")}`;

          const leftLines: string[] = [];
          leftLines.push(filterLine);
          leftLines.push(...selectList.render(leftWidth));
          while (leftLines.length < viewHeight) {
            leftLines.push("");
          }

          const session = activeItem ? sessionByPath.get(activeItem.value) : null;
          const rightLines = session
            ? getCachedPreviewLines(session.path, rightWidth)
            : [theme.fg("dim", "Select a session to preview.")];

          const scrolledRightLines = rightLines.slice(previewScrollOffset, previewScrollOffset + viewHeight);
          while (scrolledRightLines.length < viewHeight) {
            scrolledRightLines.push("");
          }

          const combinedLines: string[] = [];
          combinedLines.push(buildTopBorder(leftWidth, rightWidth, theme));
          for (let i = 0; i < viewHeight; i++) {
            const left = truncateToWidth(leftLines[i], leftWidth, "...", true);
            const right = truncateToWidth(scrolledRightLines[i], rightWidth, "...", true);
            combinedLines.push(left + divider + right);
          }
          combinedLines.push(buildBottomBorder(leftWidth, rightWidth, theme));

          return combinedLines;
        } else {
          return container.render(width);
        }
      },
      invalidate: () => {
        previewCache.clear();
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

        const termWidth = tui.terminal.columns || 80;
        const termHeight = tui.terminal.rows || 24;
        const viewHeight = Math.max(8, termHeight - 2);

        if (termWidth >= 70) {
          const leftWidth = Math.max(30, Math.min(45, Math.floor(termWidth * 0.35)));
          const rightWidth = termWidth - leftWidth - 3;
          const session = activeItem ? sessionByPath.get(activeItem.value) : null;
          const previewLines = session ? getCachedPreviewLines(session.path, rightWidth) : [];

          if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("d"))) {
            const maxScroll = Math.max(0, previewLines.length - viewHeight);
            previewScrollOffset = Math.min(maxScroll, previewScrollOffset + Math.max(1, viewHeight - 2));
            tui.requestRender();
            return;
          }
          if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("u"))) {
            previewScrollOffset = Math.max(0, previewScrollOffset - Math.max(1, viewHeight - 2));
            tui.requestRender();
            return;
          }
          if (matchesKey(data, "shift+down") || matchesKey(data, Key.ctrl("j"))) {
            const maxScroll = Math.max(0, previewLines.length - viewHeight);
            previewScrollOffset = Math.min(maxScroll, previewScrollOffset + 1);
            tui.requestRender();
            return;
          }
          if (matchesKey(data, "shift+up") || matchesKey(data, Key.ctrl("k"))) {
            previewScrollOffset = Math.max(0, previewScrollOffset - 1);
            tui.requestRender();
            return;
          }
        }

        selectList.handleInput(data);
        const newActive = selectList.getSelectedItem();
        if (newActive?.value !== activeItem?.value) {
          activeItem = newActive;
          previewScrollOffset = 0;
        }
        tui.requestRender();
      },
    };
  }, {
    overlay: true,
    overlayOptions: {
      width: "100%",
      maxHeight: "100%",
      margin: 0,
      anchor: "center",
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
