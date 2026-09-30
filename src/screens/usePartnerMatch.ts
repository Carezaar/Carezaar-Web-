import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { userService } from "../api/services";
import type { Match, UserRole } from "../api/types";
import { awaitsPartner, isVerified } from "../api/match";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";

/** What the partner profile's main action does, given the viewer's relationship with
 *  this partner:
 *  - matched → Unmatch (ends the match: `DELETE users/matches/{id}`);
 *  - a request is open → open its Pending screen (no second request can be sent);
 *  - nothing yet → Request a Match, then the Pending screen, as on Android.
 *  Messaging and requesting a match need a verified viewer (Background Check). */
export type PartnerAction = "unmatch" | "pending-sent" | "pending-received" | "request";

export function usePartnerMatch(partnerId: string, viewer: { role: UserRole; status: string } | null,
  isMatch: boolean | undefined, reloadDetail: () => void) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { act, toast, messageOf } = useFeedback();
  const [relation, setRelation] = useState<{ active: Match | null; pending: Match | null } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRelation(await userService.relationWith(partnerId));
    } catch {
      // Without the lists the profile still works; the server's is_match decides.
      setRelation({ active: null, pending: null });
    }
  }, [partnerId]);
  useEffect(() => { void refresh(); }, [refresh, isMatch]);

  const pending = relation?.pending ?? null;
  const action: PartnerAction = isMatch ? "unmatch"
    : pending && viewer ? (awaitsPartner(pending, viewer.role) ? "pending-sent" : "pending-received")
    : "request";
  const verified = viewer ? isVerified(viewer) : false;

  const requestMatch = useCallback(async () => {
    try {
      const match = await act(t("loading_match_submit", "Submitting match request"), () => userService.requestMatch(partnerId));
      navigate(`/pending/${match.id}`);
    } catch (e) { toast(messageOf(e)); }
  }, [act, t, partnerId, navigate, toast, messageOf]);

  const unmatch = useCallback(async () => {
    try {
      await act(t("loading_unmatch_submit", "Submitting unmatch request"), async () => {
        const active = relation?.active ?? (await userService.relationWith(partnerId)).active;
        if (!active) throw new Error("This match has already ended.");
        await userService.breakMatch(active.id);
      });
      reloadDetail();
      await refresh();
    } catch (e) { toast(messageOf(e)); }
  }, [act, t, relation, partnerId, reloadDetail, refresh, toast, messageOf]);

  return { action, pending, loaded: relation !== null, verified, requestMatch, unmatch };
}
