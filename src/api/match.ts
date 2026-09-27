import type { Match, MatchStage, Review, UserRole } from "./types";

/** There is no status enum on the wire; the lifecycle is derived from the two
 *  acceptance flags and `finished_at`. Note that an open request arrives with
 *  `is_active: false` (verified live), so `is_active` must not be read as "ended". */
export function matchStage(match: Match): MatchStage {
  if (match.finished_at !== null) return "history";
  return match.is_client_accepted && match.is_caregiver_accepted ? "active" : "pending";
}

/** True when the signed-in role still has to answer an incoming request. */
export function awaitsResponse(match: Match, role: UserRole): boolean {
  if (matchStage(match) !== "pending") return false;
  return role === "client" ? !match.is_client_accepted : !match.is_caregiver_accepted;
}

/** True when this role has already asked and is waiting on the other side. */
export function awaitsPartner(match: Match, role: UserRole): boolean {
  if (matchStage(match) !== "pending") return false;
  return role === "client"
    ? match.is_client_accepted && !match.is_caregiver_accepted
    : match.is_caregiver_accepted && !match.is_client_accepted;
}

/** The review this role has written. The wire fields name the party being
 *  reviewed: a client's review of the caregiver lives in `review_caregiver`
 *  (verified live: reviewer = the client). */
export function reviewBy(match: Match, role: UserRole): Review | null {
  return role === "client" ? match.review_caregiver : match.review_client;
}

/** `status` arrives lowercase on the wire (`"unverified"`) while the Kotlin enum
 *  constants are uppercase (`PENDING | UNVERIFIED | VERIFIED`). Always normalise. */
export function isVerified(user: { status: string }): boolean {
  return user.status.toUpperCase() === "VERIFIED";
}

/** Android prints the API double as-is (Kotlin `toString`): "0.0", "537.86". */
export function formatDistance(d: number | null | undefined): string {
  if (d === null || d === undefined) return "—";
  return Number.isInteger(d) ? d.toFixed(1) : String(d);
}
