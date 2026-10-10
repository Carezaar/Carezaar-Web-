import type { Match, MatchStage, UserRole } from "./types";

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

/** Android prints the API double as-is (Kotlin `toString`): "0.0", "537.86". */
export function formatDistance(d: number | null | undefined): string {
  if (d === null || d === undefined) return "—";
  return Number.isInteger(d) ? d.toFixed(1) : String(d);
}
