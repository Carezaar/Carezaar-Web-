import { localTime } from "../app/serverTime";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/errors";
import { useNavigate, useParams } from "react-router-dom";
import { caregiverService, clientService, userService, type BaseTable } from "../api/services";
import type { CaregiverFull, ChatFull, ChatMessage, ClientFull, Match, MatchListType } from "../api/types";
import { awaitsPartner, awaitsResponse, formatDistance, isVerified, matchStage, reviewBy } from "../api/match";
import { useSession } from "../auth/SessionContext";
import { useBaseData } from "../app/baseData";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { usePaged } from "../app/usePaged";
import { BackHeader, Page } from "../ui/layout";
import { Avatar, Button, cardLink, Dialog, EmptyState, ErrorState, InfiniteSentinel, PhotoBox, Spinner, TextArea } from "../ui/kit";
import { Icon } from "../ui/Icon";
import { useIsDesktop } from "../ui/frames";
import { CHATS_CHANGED, MessagesDesktop } from "./main";

/* ----------------------------------------------------------- Partner detail */

/** `CaregiverDetails/{id}` (a client viewing) and `ClientDetails/{id}` (a caregiver
 *  viewing). Message and Request-a-Match are gated exactly as in Kotlin: an
 *  unverified viewer goes to Verification; messaging needs an existing match. */
export function PartnerDetailScreen({ kind }: { kind: "caregiver" | "client" }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const { t, label } = useI18n();
  const { find } = useBaseData();
  const { run, act, toast, messageOf } = useFeedback();
  const [detail, setDetail] = useState<CaregiverFull | ClientFull | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirmMatch, setConfirmMatch] = useState(false);

  const load = useCallback(() => {
    setError(null);
    run<CaregiverFull | ClientFull>(t("loading_profile_get", "Getting profile"),
      () => (kind === "caregiver" ? clientService.caregiver(id) : caregiverService.client(id)))
      .then(setDetail).catch(setError);
  }, [kind, id, run, t]);
  useEffect(load, [load]);

  if (error) return <Page header={<BackHeader />}><ErrorState message={messageOf(error)} error={error} onRetry={load} /></Page>;
  if (!detail) return <Page header={<BackHeader />}><Spinner /></Page>;

  const partner = detail.user;
  const verifiedViewer = user ? isVerified(user) : false;
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
    if (!verifiedViewer) { navigate("/verification"); return; }
    if (!detail.is_match) { toast(t("chat_screen_match_check", "You can only send messages to your current matches.")); return; }
    try {
      const chat = await act(t("loading_chat_create", "Creating a new chat"), () => userService.createChat(detail.id));
      navigate(`/chat/${chat.id}`);
    } catch (e) { toast(messageOf(e)); }
  };

  const matchAction = () => {
    if (!verifiedViewer) { navigate("/verification"); return; }
    if (detail.is_match) { navigate("/profile/matches"); return; }
    setConfirmMatch(true);
  };

  const requestMatch = async () => {
    setConfirmMatch(false);
    try {
      await act(t("loading_match_submit", "Submitting match request"), () => userService.requestMatch(detail.id));
      load();
    } catch (e) { toast(messageOf(e)); }
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
        <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
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
        {detail.is_match
          ? <Button variant="danger" icon="ic_match_off" onClick={matchAction}>{t("general_unmatch", "Unmatch")}</Button>
          : <Button icon="ic_match_on" onClick={matchAction}>{t("match_match_button", "Request a Match")}</Button>}
      </div>
    }>
      <section className="detail-top">
        <div className="detail-photo">
          <PhotoBox src={partner.photo} />
          {isVerified(partner) && <span className="verified-tag"><Icon name="ic_verified_full" size={16} tint="var(--success)" />
            {t("navigation_drawer_user_verified", "Verified User")}</span>}
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

      <Dialog open={confirmMatch} onClose={() => setConfirmMatch(false)} labelledBy="match-title" title={t("match_match_title", "Match")}>
        <p>{t("match_match_message", "Are you sure you want to match with this user?")}</p>
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => setConfirmMatch(false)}>{t("general_cancel", "Cancel")}</Button>
          <Button onClick={() => void requestMatch()}>{t("general_confirm", "Confirm")}</Button>
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

/* --------------------------------------------------------------------- Chat */

const CHAT_POLL_MS = 10_000;

/** The API returns messages newest-first with minute-precision timestamps; the
 *  Android transcript reads oldest-at-top. Ids are monotonic, so order by id. */
function chronological(chat: ChatFull): ChatFull {
  return { ...chat, messages: [...chat.messages].sort((a, b) => a.id - b.id) };
}

/** `Chat/{chatId}`. Sending returns the whole updated `ChatFull`, so the transcript
 *  is replaced from the response rather than optimistically appended. */
export function ChatScreen() {
  const { chatId = "" } = useParams();
  const { role } = useSession();
  const { t } = useI18n();
  const { run, toast, messageOf } = useFeedback();
  const [chat, setChat] = useState<ChatFull | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const desktop = useIsDesktop();

  const load = useCallback(() => {
    setError(null);
    run(t("loading_chat_get_one", "Getting chat details"), () => userService.chat(Number(chatId)))
      .then((c) => setChat(chronological(c))).catch(setError);
  }, [chatId, run, t]);
  useEffect(load, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [chat?.messages.length]);

  // There is no push channel on the web (Android refreshes on an FCM message), so an
  // open conversation checks for new messages and read receipts while it is visible.
  useEffect(() => {
    if (menuFor === null) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest(".bubble-menu, .bubble-more")) setMenuFor(null);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", close);
    return () => { window.removeEventListener("keydown", close); window.removeEventListener("pointerdown", close); };
  }, [menuFor]);

  const chatRef = useRef(chat);
  chatRef.current = chat;
  useEffect(() => {
    const signature = (c: ChatFull) => c.messages.map((m) => `${m.id}:${m.seen_at ?? ""}`).join(",");
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      userService.chat(Number(chatId)).then((fresh) => {
        const current = chatRef.current;
        if (current && signature(current) === signature(chronological(fresh))) return;
        setChat(chronological(fresh));
        // Keep the desktop conversation list's preview in step.
        if (current && fresh.messages.length !== current.messages.length) window.dispatchEvent(new Event(CHATS_CHANGED));
      }).catch(() => undefined);
    };
    const timer = window.setInterval(refresh, CHAT_POLL_MS);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [chatId]);

  const partner = role === "client" ? chat?.caregiver?.user : chat?.client?.user;
  // A chat belongs to the match that created it; once that match ends the server
  // answers "The id field contains an unauthorized value."
  const chatMessage = (e: unknown) => (e instanceof ApiError && e.status === 400 && /unauthori[sz]ed/i.test(e.message)
    ? t("chat_screen_match_check", "You can only send messages to your current matches.") : messageOf(e));
  const mine = (m: ChatMessage) => (role === "caregiver" ? m.is_from_caregiver : !m.is_from_caregiver);

  // Messages go out one after another in the order they were written. The field
  // clears as soon as a message is queued, so a double click finds it empty and sends
  // once; if sending fails the text is put back rather than lost.
  const outbox = useRef<Promise<void>>(Promise.resolve());
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    // Android checks the partner's is_match before sending; the server itself accepts
    // messages to an ended match.
    const partnerEntity = role === "client" ? chat?.caregiver : chat?.client;
    if (partnerEntity && partnerEntity.is_match === false) {
      toast(t("chat_screen_match_check", "You can only send messages to your current matches."));
      return;
    }
    const parentId = replyTo?.id ?? null;
    setDraft(""); setReplyTo(null);
    outbox.current = outbox.current.then(async () => {
      try {
        const updated = await run(t("loading_chat_send", "Sending a new message"),
          () => userService.sendMessage(Number(chatId), text, parentId));
        setChat(chronological(updated));
        window.dispatchEvent(new Event(CHATS_CHANGED));
      } catch (e) {
        toast(chatMessage(e));
        setDraft((current) => current || text);
      }
    });
  };

  const composer = (
    <div className="composer">
      {replyTo && (
        <div className="reply-bar">
          <Icon name="ic_reply" size={18} tint="var(--primary)" />
          <span className="ellipsis">{replyTo.message}</span>
          <button type="button" className="icon-btn" onClick={() => setReplyTo(null)} aria-label={t("chat_screen_cancel", "Cancel")}>
            <Icon name="ic_clear" size={16} tint="var(--text-secondary)" />
          </button>
        </div>
      )}
      <div className="composer-row">
        <textarea rows={1} value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={t("chat_screen_message_placeholder", "Type a message...")} aria-label={t("chat_screen_message_placeholder", "Type a message...")}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button type="button" className="send-btn" onClick={send} disabled={!draft.trim()} aria-label="Send">
          <Icon name="ic_send" size={22} tint="#fff" className="flip-rtl" />
        </button>
      </div>
    </div>
  );

  const conversation = (
    <>
      <div className="chat-partner">
        <Avatar src={partner?.photo} size={44} />
        <b>{partner?.first_name} {partner?.last_name}</b>
        <button type="button" className="icon-btn" onClick={load} aria-label={t("chat_screen_refresh", "Refresh")}>
          <Icon name="ic_refresh" size={24} tint="var(--primary)" />
        </button>
      </div>
      {error ? <ErrorState message={chatMessage(error)} error={error}
          // Not the user's chat (or the match has ended): retrying cannot help.
          onRetry={chatMessage(error) === messageOf(error) ? load : undefined} />
        : !chat ? <Spinner />
        : chat.messages.length === 0 ? <EmptyState title={t("chat_screen_no_messages_yet", "No Messages Yet")} />
        : (
          <ol className="transcript">
            {chat.messages.map((m) => (
              <li key={m.id} className={`bubble-row ${mine(m) ? "mine" : "theirs"}`}>
                <div className="bubble">
                  {m.parent && <p className="quote" dir="auto">{m.parent.message}</p>}
                  <p dir="auto">{m.message}</p>
                  <span className="bubble-meta">{localTime(m.created_at)}
                    {mine(m) && <Icon name={m.seen_at ? "ic_check_double" : "ic_check"} size={16}
                      tint={mine(m) ? "rgba(255,255,255,.85)" : "var(--text-secondary)"}
                      label={m.seen_at ? `${t("chat_screen_seen_at", "Seen at")} ${localTime(m.seen_at)}` : undefined} />}
                  </span>
                </div>
                <button type="button" className="icon-btn bubble-more" aria-label="Message options"
                  onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}>
                  <Icon name="ic_more" size={20} tint="var(--text-secondary)" />
                </button>
                {menuFor === m.id && (
                  <div className="bubble-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setReplyTo(m); setMenuFor(null); }}>
                      <Icon name="ic_reply" size={18} tint="var(--text)" />{t("chat_screen_reply", "Reply")}</button>
                    <button type="button" role="menuitem" onClick={() => { void navigator.clipboard?.writeText(m.message); setMenuFor(null); }}>
                      <Icon name="ic_edit" size={18} tint="var(--text)" />{t("chat_screen_copy", "Copy")}</button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      <div ref={end} className="transcript-end" />
    </>
  );

  if (desktop) {
    return (
      <MessagesDesktop selectedId={Number(chatId)}>
        <div className="chat-pane">
          <div className="chat-pane-scroll">{conversation}</div>
          {composer}
        </div>
      </MessagesDesktop>
    );
  }
  return (
    <Page className="chat-page" header={<BackHeader title={t("chat_screen_messages_title", "Chat Messages")} />} footer={composer}>
      {conversation}
    </Page>
  );
}

/* ----------------------------------------------------------- Manage matches */

/** Profile → Matches: the user's own match records in three tabs. */
export function ManageMatchesScreen() {
  const navigate = useNavigate();
  const { role } = useSession();
  const { t } = useI18n();
  const { run, act, toast, messageOf } = useFeedback();
  const [tab, setTab] = useState<MatchListType>("matches");
  const [confirm, setConfirm] = useState<{ match: Match; action: "accept" | "reject" | "withdraw" | "unmatch" } | null>(null);
  const [reviewing, setReviewing] = useState<Match | null>(null);

  const loadingLabel = { matches: "loading_matches", requests: "loading_requests", histories: "loading_histories" }[tab];
  const list = usePaged(async (page) => {
    const work = userService.matches(tab, page);
    return page === 1 ? run(`${t(loadingLabel, "Loading")} ${page}`, () => work) : work;
  }, [tab]);

  const perform = async () => {
    if (!confirm) return;
    const { match, action } = confirm;
    setConfirm(null);
    const labels = { accept: "loading_match_accept", reject: "loading_match_reject", withdraw: "loading_match_withdraw", unmatch: "loading_unmatch_submit" };
    try {
      await act(t(labels[action], "Please wait"), async () => {
        if (action === "accept") await userService.acceptMatch(match.id);
        else if (action === "reject") await userService.rejectMatch(match.id);
        else if (action === "withdraw") await userService.withdrawMatch(match.id);
        else await userService.breakMatch(match.id);
      });
      void list.reload();
    } catch (e) { toast(messageOf(e)); }
  };

  const titles = {
    accept: ["match_accept_title", "match_accept_message"], reject: ["match_reject_title", "match_reject_message"],
    withdraw: ["match_withdraw_title", "match_withdraw_message"], unmatch: ["match_unmatch_title", "match_unmatch_message"],
  } as const;

  return (
    <Page header={<BackHeader title={t("profile_matches_title", "Matches")} />}>
      <div className="segmented" role="tablist">
        {(["matches", "requests", "histories"] as MatchListType[]).map((x) => (
          <button key={x} type="button" role="tab" aria-selected={tab === x} className={tab === x ? "on" : ""}
            onClick={() => setTab(x)}>{t(x === "histories" ? "match_tab_history" : `match_tab_${x}`, x)}</button>
        ))}
      </div>
      {list.error && list.items.length === 0 ? <ErrorState message={messageOf(list.error)} error={list.error} onRetry={() => void list.reload()} />
        : !list.loading && list.items.length === 0 ? <EmptyState title={`${t(tab === "histories" ? "match_tab_history" : `match_tab_${tab}`, tab)} (0)`} />
        : (
          <ul className="card-list">
            {list.items.map((m) => {
              const partner = role === "client" ? m.caregiver : m.client;
              const stage = matchStage(m);
              const myReview = role ? reviewBy(m, role) : null;
              return (
                <li key={m.id}>
                  <article className="match-row" {...cardLink(() => { if (partner) navigate(role === "client" ? `/caregivers/${partner.id}` : `/clients/${partner.id}`); }, `${partner?.user.first_name ?? ""} ${partner?.user.last_name ?? ""}`)}>
                    <Avatar src={partner?.user.photo} size={72} />
                    <div className="match-row-text">
                      <h3>{partner?.user.first_name} {partner?.user.last_name}</h3>
                      <p className="muted">{t("match_start", "Start")}: {m.created_at}</p>
                      {m.finished_at && <p className="muted">{t("match_end", "End")}: {m.finished_at}</p>}
                      {stage === "pending" && role && awaitsPartner(m, role) && <p className="pending-note">{t("match_pending_acceptance", "Pending Acceptance")}</p>}
                    </div>
                    <div className="match-row-side" onClick={(e) => e.stopPropagation()}>
                      <Icon name={stage === "history" ? "ic_match_off" : "ic_match_on"} size={34}
                        tint={stage === "history" ? "var(--error)" : "var(--success)"} />
                      {stage === "active" && <button type="button" className="mini-danger" onClick={() => setConfirm({ match: m, action: "unmatch" })}>{t("general_unmatch", "Unmatch")}</button>}
                      {stage === "pending" && role && awaitsResponse(m, role) && (
                        <span className="mini-actions">
                          <button type="button" className="mini-primary" onClick={() => setConfirm({ match: m, action: "accept" })}>{t("match_accept_title", "Accept")}</button>
                          <button type="button" className="mini-danger" onClick={() => setConfirm({ match: m, action: "reject" })}>{t("match_reject_title", "Reject")}</button>
                        </span>
                      )}
                      {stage === "pending" && role && awaitsPartner(m, role) && (
                        <button type="button" className="mini-danger" onClick={() => setConfirm({ match: m, action: "withdraw" })}>{t("match_withdraw_title", "Cancel")}</button>
                      )}
                      {stage === "history" && !myReview && (
                        <button type="button" className="mini-primary" onClick={() => setReviewing(m)}>{t("match_review_button", "Review")}</button>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      {list.loading && list.items.length > 0 && <Spinner />}
      <InfiniteSentinel active={list.hasMore && !list.loading} onVisible={list.loadMore} />

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} labelledBy="mm-title"
        title={confirm ? t(titles[confirm.action][0], "") : ""}>
        <p>{confirm ? t(titles[confirm.action][1], "") : ""}</p>
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => setConfirm(null)}>{t("general_cancel", "Cancel")}</Button>
          <Button variant={confirm?.action === "accept" ? "primary" : "danger"} onClick={() => void perform()}>{t("general_confirm", "Confirm")}</Button>
        </div>
      </Dialog>
      <ReviewDialog match={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); void list.reload(); }} />
    </Page>
  );
}

function ReviewDialog({ match, onClose, onDone }: { match: Match | null; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { act, toast, messageOf } = useFeedback();
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("");
  if (!match) return null;
  return (
    <Dialog open onClose={onClose} labelledBy="review-title" title={t("match_review_title", "Submit your review")}>
      <p className="muted small">{t("match_review_message", "")}</p>
      <p><b>{t("match_review_score", "Score")}</b></p>
      <div className="stars" role="radiogroup" aria-label={t("match_review_score", "Score")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={score === n} onClick={() => setScore(n)}
            className={n <= score ? "on" : ""} aria-label={`${n}`}>★</button>
        ))}
      </div>
      {/* The live server fails (400 "Undefined array key comment") on a review without
          a comment, so one is required here. */}
      <TextArea label={t("match_review_comment", "Comment")} required value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button disabled={!comment.trim()} onClick={async () => {
        try {
          await act(t("loading_review_submit", "Submitting your review"), () => userService.submitReview(match.id, score, comment.trim()));
          onDone();
        } catch (e) { toast(messageOf(e)); }
      }}>{t("match_submit_button", "Submit")}</Button>
    </Dialog>
  );
}
