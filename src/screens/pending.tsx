import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { userService } from "../api/services";
import type { Match } from "../api/types";
import { awaitsPartner, matchStage } from "../api/match";
import { useSession } from "../auth/SessionContext";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { BackHeader, Page } from "../ui/layout";
import { Avatar, Button, ErrorState, Spinner, cardLink } from "../ui/kit";
import { Icon } from "../ui/Icon";

/** `Pending/{id}` — shown after a match request, as on Android: the two people, what
 *  happens next, and Keep Exploring. The receiving side sees the partner variant. The
 *  copy keys and English defaults are Android's (`pending_*`, with its "{PARTER}" typo
 *  and "Tap the {PARTNER}'s" wording corrected); the server's content table does not
 *  have them yet, so English is shown until it does. */
export function PendingScreen() {
  const { matchId = "" } = useParams();
  const navigate = useNavigate();
  const { user, role } = useSession();
  const { t } = useI18n();
  const { run, messageOf } = useFeedback();
  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    run(t("loading_match_get", "Getting match details"), () => userService.match(Number(matchId)))
      .then(setMatch).catch(setError);
  }, [matchId, run, t]);
  useEffect(load, [load]);

  const partner = match && (role === "client" ? match.caregiver : match.client);
  const partnerPath = partner && `/${role === "client" ? "caregivers" : "clients"}/${partner.id}`;
  const stage = match ? matchStage(match) : null;

  // Accepted in the meantime: the partner's profile now shows the match.
  useEffect(() => {
    if (stage === "active" && partnerPath) navigate(partnerPath, { replace: true });
  }, [stage, partnerPath, navigate]);

  const header = <BackHeader title={t("pending_title", "Waiting for a Match")} />;
  if (error) return <Page header={header}><ErrorState message={messageOf(error)} error={error} onRetry={load} /></Page>;
  if (!match || !partner || !role) return <Page header={header}><Spinner /></Page>;

  const name = partner.user.first_name ?? "";
  const fill = (s: string) => s.replace(/\{PARTNER\}|\{PARTER\}/g, name);
  const mine = awaitsPartner(match, role);
  const keepExploring = (
    <Button trailingIcon="ic_arrow_forward" onClick={() => navigate("/main/matches")}>{t("pending_keep", "Keep Exploring")}</Button>
  );

  if (stage !== "pending") {
    return (
      <Page header={header} footer={keepExploring}>
        <div className="pending">
          <p className="pending-closed">This match request is no longer pending.</p>
        </div>
      </Page>
    );
  }

  const info: [string, string, string][] = [
    ["ic_notification_on", t("pending_notified_title", "Get notified"), t("pending_notified_message", "You will get a notification when it's a match.")],
    ["ic_timer", t("pending_pressure_title", "No pressure"), t("pending_pressure_message", "Feel free to keep exploring other possible matches in the meantime.")],
    ["ic_match_on", t("pending_fit_title", "A better fit for everyone"), t("pending_fit_message", "Matches help ensure the best care experience.")],
  ];

  return (
    <Page header={header} footer={keepExploring}>
      <div className="pending">
        <div className="pending-pair">
          <Avatar src={user?.photo} size={96} name={user?.first_name ?? undefined} />
          <span className="pending-heart" aria-hidden="true"><Icon name="ic_favorite_on" size={22} tint="var(--primary)" /></span>
          <div className="pending-partner" {...cardLink(() => partnerPath && navigate(partnerPath), name)}>
            <Avatar src={partner.user.photo} size={96} name={name} />
          </div>
        </div>
        <h2>{fill(mine ? t("pending_owner_prompt", "You are interested in {PARTNER}!") : t("pending_partner_prompt", "{PARTNER} is interested in you!"))}</h2>
        <p className="muted">{fill(mine
          ? t("pending_owner_message", "We will let you know as soon as {PARTNER} likes your profile too and accepts your request.")
          : t("pending_partner_message", "Tap {PARTNER}'s picture card to learn more about them. When you're ready, go back to the previous page to accept or reject their match request. We'll let them know your decision."))}</p>
        <ul className="pending-info">
          {info.map(([icon, title, text]) => (
            <li key={icon}>
              <span className="pending-icon"><Icon name={icon} size={22} tint="var(--primary)" /></span>
              <span><b>{title}</b><span className="muted">{text}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </Page>
  );
}
