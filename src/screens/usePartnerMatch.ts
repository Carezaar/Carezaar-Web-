import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { userService } from "../api/services";
import type { Match, UserRole } from "../api/types";
import { isVerified, matchStage } from "../api/match";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";

/** What the partner profile's main action does, from the profile's own match fields:
 *  - `is_match` → Unmatch: ends the match with `DELETE users/matches/{match_id}`;
 *  - `match_id` without `is_match` → the viewer's own request is pending; it opens the
 *    Pending screen, where it can be cancelled (`DELETE users/matches/{match_id}/withdraw`);
 *  - the partner's unanswered request (found in the request list) → Pending Review;
 *  - nothing → Request a Match.
 *  Messaging and requesting a match need a verified viewer (Background Check). */
export type PartnerAction = "unmatch" | "pending-sent" | "pending-received" | "request";

export function usePartnerMatch(partnerId: string, viewer: { role: UserRole; status: string } | null,
  detail: { is_match: boolean; match_id: number | null } | null, reloadDetail: () => void) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { act, toast, messageOf } = useFeedback();
  const [incoming, setIncoming] = useState<Match | null | undefined>(undefined);

  const isMatch = detail?.is_match ?? false;
  const matchId = detail?.match_id ?? null;
  const needsRequests = detail !== null && !isMatch && matchId === null && viewer !== null;
  useEffect(() => {
    if (!needsRequests || !viewer) { setIncoming(null); return; }
    let live = true;
    setIncoming(undefined);
    userService.incomingRequestFrom(partnerId, viewer.role)
      // Without the list the profile still works; Request a Match then gets the
      // partner's request back from the server and accepts it.
      .then((m) => live && setIncoming(m), () => live && setIncoming(null));
    return () => { live = false; };
  }, [needsRequests, partnerId, viewer]);

  const action: PartnerAction = isMatch ? "unmatch"
    : matchId !== null ? "pending-sent"
    : incoming ? "pending-received"
    : "request";
  const pendingId = action === "pending-sent" ? matchId : action === "pending-received" ? incoming?.id ?? null : null;
  const verified = viewer ? isVerified(viewer) : false;

  /** `POST users/matches` returns the existing request or match when there is one, and
   *  accepts the partner's own request, so the answer is not always a new pending request:
   *  only a pending one opens the Pending screen. */
  const requestMatch = useCallback(async (introduction?: string) => {
    try {
      const match = await act(t("loading_match_submit", "Submitting match request"), () => userService.requestMatch(partnerId, introduction));
      if (match.is_active || matchStage(match) === "active") {
        reloadDetail();
        toast(t("match_matched_message", "You are now matched."));
      } else navigate(`/pending/${match.id}`);
    } catch (e) { toast(messageOf(e)); }
  }, [act, t, partnerId, navigate, reloadDetail, toast, messageOf]);

  const unmatch = useCallback(async () => {
    try {
      if (!isMatch || matchId === null) throw new Error("This match has already ended.");
      await act(t("loading_unmatch_submit", "Submitting unmatch request"), () => userService.breakMatch(matchId));
    } catch (e) { toast(messageOf(e)); }
    reloadDetail();
  }, [act, t, isMatch, matchId, reloadDetail, toast, messageOf]);

  return { action, pendingId, loaded: detail !== null && incoming !== undefined, verified, requestMatch, unmatch };
}
