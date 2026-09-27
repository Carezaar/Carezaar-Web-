import { caregiverService, clientService } from "../api/services";
import { tokenStore } from "../api/session";
import type { UserRole } from "../api/types";

/** A signed-in start otherwise waits for `auth/info` (to learn the role) before asking
 *  for matches: two server round trips in a row. The role of the last confirmed session
 *  is remembered (nothing else), so page 1 of My Matches starts alongside `auth/info`
 *  and MatchesTab takes that request instead of issuing its own. */
const ROLE_KEY = "carezaar.role";
const MAX_AGE_MS = 30_000;

let pending: { role: UserRole; at: number; page: Promise<unknown> } | null = null;

export function rememberRole(role: UserRole | null) {
  try {
    if (role) window.localStorage.setItem(ROLE_KEY, role);
    else window.localStorage.removeItem(ROLE_KEY);
  } catch { /* storage unavailable: no prefetch */ }
}

/** Starts page 1 (default sort) when the app opens on My Matches with a stored session. */
export function prefetchFirstMatches() {
  let role: string | null = null;
  try { role = window.localStorage.getItem(ROLE_KEY); } catch { /* storage unavailable */ }
  if (!tokenStore.hasSession || (role !== "client" && role !== "caregiver")) return;
  if (!window.location.pathname.startsWith("/main/matches")) return;
  const page: Promise<unknown> = role === "client" ? clientService.matches("distance", 1) : caregiverService.matches("distance", 1);
  page.catch(() => { /* an unused or failed prefetch is not an error; MatchesTab refetches */ });
  pending = { role, at: Date.now(), page };
}

/** The prefetched page 1 for this role, once; otherwise null. */
export function takeFirstMatches<T>(role: UserRole): Promise<T> | null {
  const p = pending;
  pending = null;
  return p && p.role === role && Date.now() - p.at < MAX_AGE_MS ? (p.page as Promise<T>) : null;
}
