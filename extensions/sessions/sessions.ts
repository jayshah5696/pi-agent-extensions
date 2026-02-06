export interface SessionInfoLike {
  id: string;
  name?: string;
  cwd: string;
  modified: Date;
  firstMessage: string;
  path: string;
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
