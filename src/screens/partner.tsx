import { useCallback, useEffect, useState } from "react";
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
import { Button, Dialog, ErrorState, PhotoBox, Spinner, TextArea } from "../ui/kit";
import { INTRODUCTION_MAX_LENGTH } from "../api/config";
import { Icon } from "../ui/Icon";
import { usePartnerMatch } from "./usePartnerMatch";

/* ----------------------------------------------------------- Partner detail */

/** `CaregiverDetails/{id}` (a client viewing) and `ClientDetails/{id}` (a caregiver
 *  viewing). Messaging needs an existing match. */
export function PartnerDetailScreen({ kind }: { kind: "caregiver" | "client" }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack("/main/matches");
  const { user } = useSession();
  const { t, label } = useI18n();
  const { find } = useBaseData();
  const { run, act, toast, messageOf } = useFeedback();
  const [detail, setDetail] = useState<CaregiverFull | ClientFull | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState<"request" | "unmatch" | null>(null);
  const [introduction, setIntroduction] = useState("");

  const load = useCallback(() => {
    setError(null);
    run<CaregiverFull | ClientFull>(t("loading_profile_get", "Getting profile"),
      () => (kind === "caregiver" ? clientService.caregiver(id) : caregiverService.client(id)))
      .then(setDetail).catch(setError);
  }, [kind, id, run, t]);
  useEffect(load, [load]);
  const match = usePartnerMatch(id, user, detail, load);

  if (error) return <Page header={<BackHeader />}><ErrorState message={messageOf(error)} error={error} onRetry={load} /></Page>;
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
    if (!detail.is_match) { toast(t("chat_screen_match_check", "You can only send messages to your current matches.")); return; }
    try {
      const chat = await act(t("loading_chat_create", "Creating a new chat"), () => userService.createChat(detail.id));
      navigate(`/chat/${chat.id}`);
    } catch (e) { toast(messageOf(e)); }
  };

  const mainAction = () => {
    if (match.action === "unmatch") { setConfirm("unmatch"); return; }
    if (match.pendingId !== null) { navigate(`/pending/${match.pendingId}`); return; }
    setIntroduction("");
    setConfirm("request");
  };
  const confirmed = () => {
    const which = confirm;
    setConfirm(null);
    void (which === "unmatch" ? match.unmatch() : match.requestMatch(introduction));
  };

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
        <Button variant="outline" icon="ic_message" onClick={() => void message()}>{t(`${prefix}_message`, "Message")}</Button>
        {match.action === "unmatch"
          ? <Button variant="danger" icon="ic_match_off" onClick={mainAction}>{t("general_unmatch", "Unmatch")}</Button>
          : match.action === "pending-sent"
            ? <Button variant="outline" icon="ic_timer" onClick={mainAction}>{t("match_pending_acceptance", "Pending Acceptance")}</Button>
            : match.action === "pending-received"
              ? <Button variant="outline" icon="ic_timer" onClick={mainAction}>{t("match_pending_review", "Pending Review")}</Button>
              : <Button icon="ic_match_on" disabled={!match.loaded} onClick={mainAction}>{t("match_match_button", "Request a Match")}</Button>}
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

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} labelledBy="match-title"
        title={confirm === "unmatch" ? t("match_unmatch_title", "Unmatch") : t("match_match_button", "Request a Match")}>
        <p>{confirm === "unmatch"
          ? t("match_unmatch_message", "Are you sure you want to end your match with this user?")
          : t("match_match_message", "Are you sure you want to match with this user? They should accept your request.")}</p>
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
          <Button variant="outline" onClick={() => setConfirm(null)}>{t("general_cancel", "Cancel")}</Button>
          <Button variant={confirm === "unmatch" ? "danger" : "primary"} onClick={confirmed}>
            {confirm === "unmatch" ? t("general_confirm", "Confirm") : t("match_match_title", "Match")}
          </Button>
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
