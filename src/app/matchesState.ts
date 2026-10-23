/** My Matches state for the signed-in session (client request, 23 Oct 2026): the chosen sort
 *  is remembered while the person stays signed in and forgotten when they sign out; the list
 *  they had loaded (every page, and where they were in it) is kept while they open a profile,
 *  Messages or another tab, and quietly refreshed when they come back.
 *
 *  Everything is keyed by the sign-in (`tokenStore.owner`, new at every login and kept by
 *  token renewal) plus the account and role, so nothing of one sign-in or account can be
 *  shown to another. The sort survives a reload (localStorage, owner-checked); the loaded
 *  list is kept in memory only. */
import type { MatchSort } from "../api/types";

export type MatchesKey = string;
export const matchesKey = (owner: string | null, userId: string | null | undefined, role: string | null | undefined): MatchesKey | null =>
  owner && userId && role ? `${owner}|${userId}|${role}` : null;

export interface MatchesSnapshot<T = unknown> {
  key: MatchesKey;
  sort: MatchSort;
  items: T[];
  page: number;
  ended: boolean;
  total: number | null;
  /** Scroll offset of the page when the person left My Matches. */
  scroll: number;
}

const SORT_KEY = "carezaar.matchesSort";
const SORTS: MatchSort[] = ["distance", "pay"];
let snapshot: MatchesSnapshot | null = null;
// The banner's care types (from the person's own profile), kept so the banner has its final
// size on return and the list stays where it was.
let banner: { key: MatchesKey; ids: number[] } | null = null;
let shared: { id: string; promise: Promise<unknown> } | null = null;

export function rememberedSort(key: MatchesKey | null): MatchSort | null {
  if (!key) return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(SORT_KEY) ?? "null") as { key?: string; sort?: string } | null;
    return saved?.key === key && SORTS.includes(saved.sort as MatchSort) ? (saved.sort as MatchSort) : null;
  } catch {
    return null;
  }
}

export function rememberSort(key: MatchesKey | null, sort: MatchSort) {
  if (!key) return;
  try { window.localStorage.setItem(SORT_KEY, JSON.stringify({ key, sort })); } catch { /* storage unavailable: kept for this page only */ }
}

/** The list left on My Matches by this sign-in, in this sort, if any. */
export function readSnapshot<T>(key: MatchesKey | null, sort: MatchSort): MatchesSnapshot<T> | null {
  return key && snapshot && snapshot.key === key && snapshot.sort === sort && snapshot.page > 0
    ? (snapshot as MatchesSnapshot<T>) : null;
}

export function writeSnapshot<T>(next: MatchesSnapshot<T>) {
  snapshot = next as MatchesSnapshot;
}

export function saveScroll(key: MatchesKey | null, scroll: number) {
  if (key && snapshot?.key === key) snapshot = { ...snapshot, scroll };
}

export function readBanner(key: MatchesKey | null): number[] | null {
  return key && banner?.key === key ? banner.ids : null;
}

export function writeBanner(key: MatchesKey | null, ids: number[]) {
  if (key) banner = { key, ids };
}

/** One refresh at a time per sign-in, sort and page count: coming back to the tab again while
 *  a refresh is running shares it instead of sending the same requests twice. */
export function sharedRefresh<R>(id: string, start: () => Promise<R>): Promise<R> {
  if (shared?.id === id) return shared.promise as Promise<R>;
  const promise = start().finally(() => { if (shared?.promise === promise) shared = null; });
  shared = { id, promise };
  return promise;
}

/** Sign-out: forget the sort and the list. */
export function forgetMatches() {
  snapshot = null;
  banner = null;
  shared = null;
  try { window.localStorage.removeItem(SORT_KEY); } catch { /* ignore */ }
}
