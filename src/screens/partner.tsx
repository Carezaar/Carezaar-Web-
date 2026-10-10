import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGoBack } from "../navigation/back";
import { caregiverService, clientService, userService, type BaseTable } from "../api/services";
import type { CaregiverFull, ClientFull } from "../api/types";
import { formatDistance } from "../api/match";
import { useSession } from "../auth/SessionContext";
import { useBaseData } from "../app/baseData";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { BackHeader, Page } from "../ui/layout";
import { Avatar, Button, Dialog, PhotoBox, Spinner, TextArea } from "../ui/kit";
import { INTRODUCTION_MAX_LENGTH } from "../api/config";
import { Icon } from "../ui/Icon";
import { usePartnerMatch, type MatchMutation } from "./usePartnerMatch";

/* ----------------------------------------------------------- Partner detail */

/** `CaregiverDetails/{id}` (a client viewing) and `ClientDetails/{id}` (a caregiver
 *  viewing). Messaging needs an active match. */
export function PartnerDetailScreen({ kind }: { kind: "caregiver" | "client" }) {
  const { id = "" } = useParams();
  // A new URL owns fresh detail/action state; a slow previous profile response
  // must never supply the name or action metadata for the next partner.
  return <PartnerDetailContent key={`${kind}/${id}`} kind={kind} id={id} />;
}

function PartnerDetailContent({ kind, id }: { kind: "caregiver" | "client"; id: string }) {
  const navigate = useNavigate();
  const goBack = useGoBack("/main/matches");
  const { user } = useSession();
  const { t, label } = useI18n();
  const { find } = useBaseData();
  const { run, act, toast, messageOf } = useFeedback();
  const [detail, setDetail] = useState<CaregiverFull | ClientFull | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState<MatchMutation | null>(null);
  const [introduction, setIntroduction] = useState("");
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;

  const load = useCallback(() => {
    return run<CaregiverFull | ClientFull>(t("loading_profile_get", "Getting profile"),
      () => (kind === "caregiver" ? clientService.caregiver(id) : caregiverService.client(id)))
      .then(setDetail)
      .catch((e) => { toast(messageOf(e)); setFailed(true); });
  }, [kind, id, run, t, toast, messageOf]);
  useEffect(() => { void load(); }, [load]);
  // A profile that can't be loaded: a short message, then back to the previous screen
  // after two seconds, as on Android. Leaving earlier cancels the timer.
  useEffect(() => {
    if (!failed) return;
    const timer = window.setTimeout(() => goBackRef.current(), 2000);
    return () => window.clearTimeout(timer);
  }, [failed]);
  const match = usePartnerMatch(id, user, detail, setDetail);
  // Metadata that can't be read is the "Couldn't check this match" case.
  const unreadable = detail !== null && !match.loaded;
  const [checkDismissed, setCheckDismissed] = useState(false);

  if (failed) return <Page header={<BackHeader />}><p className="state muted" role="status">{t("error_profile_unavailable", "This profile isn't available.")}</p></Page>;
  if (!detail) return <Page header={<BackHeader />}><Spinner /></Page>;

  const partner = detail.user;
  const labels = (table: BaseTable, ids: number[]) => ids.map((x) => find(table, x)).filter(Boolean);

  const toggleFavorite = async () => {
    const on = partner.is_favorite;
    setDetail({ ...detail, user: { ...partner, is_favorite: !on } } as typeof detail);
    try {
      await act(on ? t("loading_favorite_delete", "Removing from favorite list") : t("loading_favorite_create", "Adding to favorite list"),
        () => (on ? userService.removeBookmark(partner.id) : userService.addBookmark(partner.id)));
    } catch (e) {
      setDetail({ ...detail, user: { ...partner, is_favorite: on } } as typeof detail);
      toast(messageOf(e));
    }
  };

  const message = async () => {
    // The button only exists for an active match; this also covers a stale screen.
    if (match.status !== "active") { toast(t("chat_screen_match_check", "You can only send messages to your current matches.")); return; }
    try {
      const chat = await act(t("loading_chat_create", "Creating a new chat"), () => userService.createChat(detail.id));
      navigate(`/chat/${chat.id}`);
    } catch (e) { toast(messageOf(e)); }
  };

  const mainAction = (which: MatchMutation) => {
    if (which === "request") setIntroduction("");
    setConfirm(which);
  };
  const confirmed = () => {
    if (!confirm) return;
    const which = confirm;
    setConfirm(null);
    void match.perform(which, introduction);
  };
  const titles = {
    request: ["match_match_button", "Request a Match"], accept: ["match_accept_title", "Accept"],
    reject: ["match_reject_title", "Reject"], withdraw: ["match_withdraw_title", "Cancel"],
    unmatch: ["match_unmatch_title", "Unmatch"],
  } as const;
  /** The confirming button is named after the action itself, never "Confirm". */
  const actions = {
    request: ["match_match_title", "Match"], accept: ["match_accept_title", "Accept"],
    reject: ["match_reject_title", "Reject"], withdraw: ["match_withdraw_title", "Cancel"],
    unmatch: ["match_unmatch_title", "Unmatch"],
  } as const;
  const messages = {
    request: ["match_match_message", "Are you sure you want to match with this user? They should accept your request."],
    accept: ["match_accept_message", "Are you sure you want to accept this match request?"],
    reject: ["match_reject_message", "Are you sure you want to reject this match request?"],
    withdraw: ["match_withdraw_message", "Are you sure you want to cancel your match request with this user?"],
    unmatch: ["match_unmatch_message", "Are you sure you want to end your match with this user?"],
  } as const;
  const fullName = `${partner.first_name ?? ""} ${partner.last_name ?? ""}`.trim();

  const isCaregiver = kind === "caregiver";
  const cg = detail as CaregiverFull;
  const cl = detail as ClientFull;
  const tiles = isCaregiver ? labels("careconditions", cg.carecondition_ids) : labels("careconditions", cl.carecondition_ids);
  const qualities = isCaregiver ? labels("carespecials", cg.carespecial_ids) : labels("carespecials", cl.carespecial_ids);
  const languages = isCaregiver ? labels("languageskills", cg.languageskill_ids) : labels("languageskills", cl.languageskill_ids);
  const prefix = isCaregiver ? "caregiver_details" : "client_details";

  return (
    <Page className="detail-page" header={
      <header className="detail-header">
        <button type="button" className="icon-btn" onClick={() => goBack()} aria-label="Back">
          <Icon name="ic_arrow_backward" size={26} tint="var(--text)" className="flip-rtl" />
        </button>
        <button type="button" className="icon-btn" onClick={() => void toggleFavorite()} aria-pressed={partner.is_favorite}
          aria-label={partner.is_favorite ? "Remove from favorites" : "Add to favorites"}>
          <Icon name={partner.is_favorite ? "ic_favorite_on" : "ic_favorite_off"} size={28}
            tint={partner.is_favorite ? "var(--error)" : "var(--primary-dark)"} />
        </button>
      </header>
    } footer={
      <div className="detail-actions">
        {/* Messaging is for an active match only: before that there is no Message button. */}
        {match.status === "active" && <Button variant="outline" icon="ic_message" onClick={() => void message()}>{t(`${prefix}_message`, "Message")}</Button>}
        {unreadable ? <Button variant="outline" disabled={match.busy} onClick={() => void match.retryCheck()}>{t("general_try_again", "Try Again")}</Button>
          : match.action === "received" ? <>
            <Button disabled={match.busy} variant="danger" onClick={() => mainAction("reject")}>{t("match_reject_title", "Reject")}</Button>
            <Button disabled={match.busy} onClick={() => mainAction("accept")}>{t("match_accept_title", "Accept")}</Button>
          </> : match.action === "withdraw" ? <>
            <span className="pending-note">{t("match_pending_acceptance", "Pending Acceptance")}</span>
            <Button disabled={match.busy} variant="outline" onClick={() => mainAction("withdraw")}>{t("match_withdraw_title", "Cancel")}</Button>
          </> : match.action === "unmatch" ? <Button disabled={match.busy} variant="danger" icon="ic_match_off" onClick={() => mainAction("unmatch")}>{t("match_unmatch_title", "Unmatch")}</Button>
          : <Button disabled={match.busy} icon="ic_match_on" onClick={() => mainAction("request")}>{t("match_match_button", "Request a Match")}</Button>}
      </div>
    }>
      <section className="detail-top">
        <div className="detail-photo">
          <PhotoBox src={partner.photo} />
        </div>
        <div className="detail-facts">
          <h1><Icon name={find("genders", partner.gender_id)?.icon} size={26} tint="var(--primary-dark)" />
            {partner.first_name} {partner.last_name}</h1>
          <p className="muted">{isCaregiver ? label(find("roles", cg.role_id)) : label(find("clienttypes", cl.clienttype_id))}</p>
          <p className="fact"><Icon name="ic_distance" size={26} tint="var(--primary-dark)" /><b>{formatDistance(detail.distance)}</b> {t("general_miles_away", "mile(s) away")}</p>
          {isCaregiver && <p className="fact"><Icon name="ic_calendar" size={26} tint="var(--primary-dark)" />{label(find("experiences", cg.experience_id))}</p>}
          <p className="fact"><Icon name="ic_usd_circle" size={26} tint="var(--primary-dark)" />
            <b><bdi className="range">{detail.salary_min ?? "—"} - {detail.salary_max ?? "—"}</bdi></b> {t(`${prefix}_usd_per_hour`, "USD per hour")}</p>
        </div>
      </section>
      <section className="detail-pair">
        <div><h3>{isCaregiver ? t("caregiver_details_maximum_commute_distance", "Maximum Commute Distance") : t("client_details_max_commute", "Max Commute")}</h3>
          <p>{isCaregiver ? label(find("commutes", cg.commute_id)) : labels("commutes", cl.commute_ids).map(label).join(", ")}</p></div>
        <div><h3>{isCaregiver ? t("caregiver_details_work_type", "Work Type") : t("client_details_work_types", "Work Types")}</h3>
          <p>{isCaregiver ? label(find("worktypes", cg.worktype_id)) : labels("worktypes", cl.worktype_ids).map(label).join(", ")}</p></div>
      </section>
      {partner.bio && <blockquote className="bio"><Icon name="ic_quote" size={30} tint="var(--primary-dark)" /><p dir="auto">{partner.bio}</p></blockquote>}
      <DetailTiles title={isCaregiver ? t("caregiver_details_provided_care_types", "Provided Care Types") : t("client_details_needed_care_types", "Needed Care Types")} items={tiles} tiles />
      <DetailTiles title={isCaregiver ? t("caregiver_details_special_qualities", "Special Qualities") : t("client_details_special_qualities", "Important Qualities")} items={qualities} />
      <DetailTiles title={isCaregiver ? t("caregiver_details_spoken_languages", "Spoken Languages") : t("client_details_preferred_languages", "Preferred Language")} items={languages} coloured />
      <DetailTiles title={isCaregiver ? t("caregiver_details_preferred_shifts", "Preferred Shifts") : t("client_details_preferred_shifts", "Preferred Shifts")}
        items={labels("shifts", isCaregiver ? cg.shift_ids : cl.shift_ids)} />
      <DetailTiles title={isCaregiver ? t("caregiver_details_selected_work_days", "Selected Work Days") : t("client_details_work_days", "Work Days")}
        items={labels("caredays", isCaregiver ? cg.careday_ids : cl.careday_ids)} />
      <DetailTiles title={isCaregiver ? t("caregiver_details_certifications", "Certifications") : t("client_details_certifications", "Required Certifications")}
        items={labels("certifications", isCaregiver ? cg.certification_ids : cl.certification_ids)} />
      {isCaregiver && <DetailTiles title={t("caregiver_details_supported_care_needer_types", "Supported Care Needer Types")} items={labels("clienttypes", cg.clienttype_ids)} coloured />}
      {/* What the client is looking for in a caregiver, as on Android. Empty lists are left out. */}
      {!isCaregiver && <>
        <DetailTiles title={t("client_details_gender_preferences", "Preferred Caregiver Gender")} items={labels("genders", cl.gender_ids)} />
        <DetailTiles title={t("client_details_experience", "Minimum Experience")} items={labels("experiences", cl.experience_ids)} />
        <DetailTiles title={t("client_details_role", "Preferred Caregiver Role")} items={labels("roles", cl.role_ids)} />
      </>}

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} labelledBy="match-title"
        title={confirm ? t(titles[confirm][0], titles[confirm][1]) : ""}>
        <p>{confirm ? t(messages[confirm][0], messages[confirm][1]) : ""}</p>
        {/* A received request: who is asking, and the introduction they wrote. */}
        {(confirm === "accept" || confirm === "reject") && (
          <div className="request-context">
            <div className="request-context-who"><Avatar src={partner.photo} size={44} name={fullName} /><b dir="auto">{fullName}</b></div>
            {detail.match_introduction?.trim() && (
              <blockquote className="request-intro"><b>{t("match_introduction_title", "Introduction")}</b><p dir="auto">{detail.match_introduction}</p></blockquote>
            )}
          </div>
        )}
        {confirm === "request" && (
          <>
            {/* Optional introduction sent with the request, as in the native app. */}
            <TextArea label={t("match_introduction_title", "Introduction")} value={introduction} maxLength={INTRODUCTION_MAX_LENGTH}
              onChange={(e) => setIntroduction(e.target.value)} dir="auto"
              placeholder={t("match_introduction_message", "You can introduce yourself here (Optional)")} />
            <p className="field-counter muted small" aria-live="polite">{introduction.length}/{INTRODUCTION_MAX_LENGTH}</p>
          </>
        )}
        <div className="dialog-actions">
          {/* Cancelling a request is itself labelled "Cancel", so that dialog closes with ✕. */}
          {confirm === "withdraw"
            ? <button type="button" className="icon-btn dialog-close" onClick={() => setConfirm(null)} aria-label="Close">
                <Icon name="ic_clear" size={18} tint="var(--text-secondary)" /></button>
            : <Button variant="outline" onClick={() => setConfirm(null)}>{t("general_cancel", "Cancel")}</Button>}
          <Button variant={confirm === "request" || confirm === "accept" ? "primary" : "danger"} onClick={confirmed}>
            {confirm ? t(actions[confirm][0], actions[confirm][1]) : ""}
          </Button>
        </div>
      </Dialog>

      <Dialog open={match.checkFailed || (unreadable && !checkDismissed)} onClose={() => { match.setCheckFailed(false); setCheckDismissed(true); }} labelledBy="match-check-title"
        title={t("match_check_failed_title", "Couldn't check this match")}>
        <p>{t("match_check_failed_message", "Please check your connection and try again.")}</p>
        <div className="dialog-actions">
          <Button disabled={match.busy} onClick={() => void match.retryCheck()}>{t("general_try_again", "Try Again")}</Button>
        </div>
      </Dialog>
    </Page>
  );
}

function DetailTiles({ title, items, tiles = false, coloured = false }: {
  title: string; items: (import("../api/types").BaseItem | undefined)[]; tiles?: boolean; coloured?: boolean;
}) {
  const { label } = useI18n();
  const present = items.filter((x): x is import("../api/types").BaseItem => Boolean(x));
  if (present.length === 0) return null;
  return (
    <section className="detail-section">
      <h2>{title}</h2>
      <div className={tiles ? "tile-scroll" : "pill-scroll"} tabIndex={0} role="group" aria-label={title}>
        {present.map((item) => (
          <span key={item.id} className={tiles ? "tile" : "pill"}>
            {item.icon && <Icon name={item.icon} size={tiles ? 64 : 26} tint={coloured ? undefined : "var(--primary-dark)"} />}
            <span>{label(item)}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
