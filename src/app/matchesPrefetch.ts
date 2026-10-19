import type { ApiMeta, CaregiverBrief, ClientBrief, UserRole } from "../api/types";
import { caregiverService, clientService } from "../api/services";
import { tokenStore, type SessionOwner } from "../api/session";

/** A returning signed-in user opening My Matches: start its first page alongside the
 *  session check instead of after it (about a second sooner on this API). The request is
 *  the same one My Matches makes; it is used only for the same stored login, role, sort
 *  and page, once, and while fresh. Anything else makes the normal request. */
const HINT = "carezaar.roleHint";
const MAX_AGE_MS = 20_000;

type Page = { result: (CaregiverBrief | ClientBrief)[]; meta: ApiMeta | null };
let pending: { owner: string; role: UserRole; at: number; page: Promise<Page> } | null = null;

/** Called when a session is accepted: remembers which list this login opens. */
export function rememberRole(owner: SessionOwner, role: UserRole) {
  if (!owner || (role !== "client" && role !== "caregiver")) return;
  try { window.localStorage.setItem(HINT, JSON.stringify({ owner, role })); } catch { /* no storage */ }
}

function readHint(): { owner: string; role: UserRole } | null {
  try {
    const hint = JSON.parse(window.localStorage.getItem(HINT) ?? "null") as { owner?: unknown; role?: unknown } | null;
    if (typeof hint?.owner !== "string" || (hint.role !== "client" && hint.role !== "caregiver")) return null;
    return { owner: hint.owner, role: hint.role };
  } catch {
    return null;
  }
}

/** At page load, before the session check: start My Matches' first page when the page
 *  opened is My Matches and the stored login is the one the hint was written for. */
export function startMatchesPrefetch(pathname: string) {
  if (pathname !== "/main/matches") return;
  const owner = tokenStore.owner, hint = readHint();
  if (!owner || !tokenStore.hasSession || hint?.owner !== owner) return;
  const page: Promise<Page> = hint.role === "client" ? clientService.matches("distance", 1) : caregiverService.matches("distance", 1);
  page.catch(() => undefined); // an unused failure must not surface as unhandled
  pending = { owner, role: hint.role, at: Date.now(), page };
}

/** My Matches' first page for this login, role and sort, if one was started; once only. */
export function takeMatchesPrefetch(role: UserRole, sort: string, page: number): Promise<Page> | null {
  const started = pending;
  pending = null;
  if (!started || page !== 1 || sort !== "distance" || started.role !== role) return null;
  if (started.owner !== tokenStore.owner || Date.now() - started.at > MAX_AGE_MS) return null;
  return started.page;
}
