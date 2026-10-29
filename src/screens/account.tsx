import { asStored } from "../app/serverTime";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "../navigation/back";
import { ApiError, RefusedWhileRenewalUnreachableError } from "../api/errors";
import { authService, caregiverService, clientService, userService } from "../api/services";
import type { AppNotification, Faq, FaqCategory, Issue, User } from "../api/types";
import { useSession } from "../auth/SessionContext";
import { useBaseData, useBaseLists } from "../app/baseData";
import { BaseListsGate } from "../ui/BaseListsGate";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { personName } from "../app/names";
import { usePaged } from "../app/usePaged";
import { CHANGE_PASSWORD_SPECIAL_CHARACTERS, canSubmitPasswordChange, passwordRules, required } from "../validation/validation";
import { BackHeader, Page } from "../ui/layout";
import { Avatar, Button, cardLink, Checkbox, Dialog, EmptyState, ErrorState, Field, InfiniteSentinel, InlineProgress, SkeletonList, TextArea, TextField } from "../ui/kit";
import { DuplicateActionError, isGuarded, useGuarded } from "../app/actionGuard";
import { SETTLED_AFTER_MS, retireCarriedOut } from "../api/idempotency";
import { Icon } from "../ui/Icon";
import { sanitizeHtml } from "../ui/sanitize";
import { RuleChips } from "../ui/RuleChips";
import { useNotifications } from "../app/notifications";

const partnerPath = (u: User) => (u.role === "caregiver" ? `/caregivers/${u.id}` : `/clients/${u.id}`);

/* ----------------------------------------------------------- Notifications */

export function NotificationsScreen() {
  const navigate = useNavigate();
  const { t, label } = useI18n();
  const { find } = useBaseData();
  const { act, toast, messageOf } = useFeedback();
  const [selected, setSelected] = useState<AppNotification | null>(null);
  const list = usePaged((page) => userService.notifications(page), []);
  const { markChecked } = useNotifications();
  useEffect(() => markChecked, [markChecked]);

  // Tapping a notification opens its details; the related page opens only on Show.
  const open = (n: AppNotification) => {
    setSelected(n);
    if (!n.seen_at) {
      void act(`notification:${n.id}`, () => userService.markNotificationSeen(n.id))
        .then((seen) => list.mutate((all) => all.map((x) =>
          x.id === n.id ? { ...x, seen_at: seen.seen_at ?? "now" } : x)))
        .catch((error) => toast(messageOf(error)));
    }
  };

  /** Where Show leads, or null when the related person or chat no longer exists (then
   *  the details window simply has no Show button). */
  const target = (n: AppNotification): { path: string; state?: unknown } | null => {
    const code = find("subjects", n.subject_id)?.code ?? "";
    if (code.startsWith("chat")) return n.chat ? { path: `/chat/${n.chat.id}` } : null;
    if (!n.partner) return null;
    if (code === "match_accept") {
      return { path: `/matched/${n.partner.role === "caregiver" ? "caregivers" : "clients"}/${n.partner.id}`, state: { from: "notification" } };
    }
    // A request, a match that ended ("unmatch") and anything else about a person: their profile.
    return { path: partnerPath(n.partner) };
  };
  const shown = selected ? target(selected) : null;

  return (
    <Page header={<BackHeader title={t("general_notifications", "Notifications")} />}>
      {/* Each row's text and where Show leads come from the notification subjects. */}
      <BaseListsGate names={["subjects"]} placeholder={<SkeletonList count={6} variant="row" label={t("loading_user_notifications_get", "Getting notifications")} />}>
      {list.error && list.items.length === 0 ? <ErrorState message={messageOf(list.error)} error={list.error} onRetry={() => void list.reload()} />
        : list.items.length === 0 && (list.loading || list.page === 0) ? <SkeletonList count={6} variant="row" label={t("loading_user_notifications_get", "Getting notifications")} />
        : list.items.length === 0 ? <EmptyState title={t("general_notifications", "Notifications")} illustration="ic_notification_off" tint="var(--primary)" />
        : (
          <ul className="row-list">
            {list.items.map((n) => (
              <li key={n.id}>
                {/* Figma v2 frame 738:11732: dot, subject icon, name + event, date, chevron. */}
                <button type="button" className="notif-row" onClick={() => open(n)} aria-haspopup="dialog">
                  <span className={`notif-dot ${n.seen_at ? "" : "on"}`} aria-label={n.seen_at ? undefined : "Unread"} />
                  {(() => {
                    const isChat = find("subjects", n.subject_id)?.code === "chat_new";
                    return (
                      <span className={`notif-icon ${isChat ? "chat" : "info"}`}>
                        <Icon name={isChat ? "ic_message" : "ic_info_circle"} size={22} tint={isChat ? "#6d4bc2" : "#b98900"} />
                      </span>
                    );
                  })()}
                  <span className="notif-text">
                    {n.partner && <b dir="auto">{personName(n.partner, t)}</b>}
                    <span>{label(find("subjects", n.subject_id))}</span>
                  </span>
                  <span className="notif-when">
                    <Icon name="ic_clock" size={12} tint="var(--text-secondary)" />
                    <span className="notif-date">{asStored(n.created_at).split(" ").map((part) => <span key={part}>{part}</span>)}</span>
                  </span>
                  <Icon name="ic_chevron_forward" size={16} tint="var(--text-secondary)" className="flip-rtl notif-chevron" />
                </button>
              </li>
            ))}
          </ul>
        )}
      {list.loading && list.items.length > 0 && <InlineProgress />}
      <InfiniteSentinel active={list.hasMore && !list.loading && !list.error} onVisible={list.loadMore} resetKey={list.page} />
      {/* The details: who, what, and Show. No date (it's on the row just tapped) and no
          Cancel: tapping outside or Escape closes it, leaving Show as the one action. */}
      <Dialog open={selected !== null} onClose={() => setSelected(null)} labelledBy="notification-text">
        {selected && (
          <div className="notif-details">
            {selected.partner && (
              <div className="notif-details-who">
                <Avatar src={selected.partner.photo} size={64} />
                <b dir="auto">{personName(selected.partner, t)}</b>
              </div>
            )}
            <p id="notification-text">{label(find("subjects", selected.subject_id)) || t("general_notifications", "Notifications")}</p>
            {shown && <Button onClick={() => { setSelected(null); navigate(shown.path, { state: shown.state }); }}>{t("general_show", "Show")}</Button>}
          </div>
        )}
      </Dialog>
      </BaseListsGate>
    </Page>
  );
}

/* ---------------------------------------------------------------- Favorites */

export function FavoritesScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { act, toast, messageOf } = useFeedback();
  const list = usePaged((page) => userService.bookmarks(page), []);
  const remove = async (u: User) => {
    const removeLocally = () => list.mutate((all) => all.filter((x) => x.id !== u.id));
    try {
      await act(`bookmark:${u.id}`, () => userService.removeBookmark(u.id));
      removeLocally();
    } catch (e) {
      if (e instanceof DuplicateActionError) return;
      // A lost answer may follow a successful removal. Read the exact person's
      // current state, without replaying the mutation or hiding an unconfirmed row.
      if (e instanceof ApiError && (e.kind === "network" || e.kind === "timeout")) {
        try {
          const detail = u.role === "caregiver" ? await clientService.caregiver(u.id) : await caregiverService.client(u.id);
          if (detail.user?.id === u.id && detail.user.is_favorite === false) {
            removeLocally();
            return;
          }
        } catch { /* Still uncertain: retain the card and report the original error. */ }
      }
      toast(messageOf(e));
    }
  };
  return (
    <Page header={<BackHeader title={t("profile_favorites_title", "Favorites")} />}>
      <div className="fav-head"><span><Icon name="ic_favorite_on" size={44} tint="var(--primary-dark)" /></span></div>
      {list.error && list.items.length === 0 ? <ErrorState message={messageOf(list.error)} error={list.error} onRetry={() => void list.reload()} />
        : list.items.length === 0 && (list.loading || list.page === 0) ? <SkeletonList count={4} variant="row" label={t("loading_favorite_get", "Getting favorites")} />
        : list.items.length === 0 ? <EmptyState title={t("profile_favorites_title", "Favorites")} illustration="ic_favorite_off" tint="var(--primary)" />
        : (
          <ul className="card-list">
            {list.items.map((u) => (
              <li key={u.id}>
                <div className="fav-card" {...cardLink(() => navigate(partnerPath(u)), personName(u, t))}>
                  <Avatar src={u.photo} size={96} />
                  <div className="fav-text"><h2>{personName(u, t)}</h2><p className="clamp-3" dir="auto">{u.bio}</p></div>
                  <div className="match-side">
                    <RemoveFavoriteButton id={u.id} onRemove={() => void remove(u)} />
                    <Icon name="ic_chevron_forward" size={20} tint="var(--text-secondary)" className="flip-rtl" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      {list.loading && list.items.length > 0 && <InlineProgress />}
      <InfiniteSentinel active={list.hasMore && !list.loading && !list.error} onVisible={list.loadMore} resetKey={list.page} />
    </Page>
  );
}

/** The heart on a favourite: disabled, with progress, while its removal is unresolved. */
function RemoveFavoriteButton({ id, onRemove }: { id: string; onRemove: () => void }) {
  const busy = useGuarded(`bookmark:${id}`);
  return (
    <button type="button" className="icon-btn" aria-label="Remove from favorites" disabled={busy} aria-busy={busy}
      onClick={(e) => { e.stopPropagation(); onRemove(); }}>
      {busy ? <span className="spinner spinner-sm inline-spinner" aria-hidden="true" /> : <Icon name="ic_favorite_on" size={28} tint="var(--error)" />}
    </button>
  );
}

/* ------------------------------------------------------------- Help center */

export function HelpCenterScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <Page header={<BackHeader title={t("contact_support_title", "Help Center")} />}
      footer={<Button variant="ghost" className="help-delete" onClick={() => navigate("/delete-account")}>
        {t("profile_delete_account_title", "Delete Account")}
      </Button>}>
      <div className="stack">
        <div className="center"><Icon name="ic_support" size={96} tint="var(--primary-dark)" />
          <h2 className="title">{t("contact_support_subtitle", "We are here to help")}</h2>
          <p className="muted">{t("contact_support_description", "")}</p></div>
        <a className="menu-row card" href="mailto:support@carezaar.com">
          <span className="menu-icon"><Icon name="ic_email" size={30} tint="var(--primary-dark)" /></span>
          <span className="menu-text"><b>{t("contact_support_email_title", "Email Us")}</b>
            <small>support@carezaar.com · {t("contact_support_email_description", "We will respond within 24 hours.")}</small></span>
        </a>
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------------------- FAQ */

export function FaqScreen() {
  const { t, languageId } = useI18n();
  const { extra } = useBaseData();
  // Loaded and cached with the other reference lists at start-up.
  const faqs = extra<Faq>("faqs");
  const categories = extra<FaqCategory>("faq_categories");
  const [active, setActive] = useState<number | null>(null);
  const pick = <T extends { language_id: number }>(list?: T[]) => { const ts = list ?? []; return ts.find((x) => x.language_id === languageId) ?? ts.find((x) => x.language_id === 1) ?? ts[0]; };
  const shown = useMemo(() => faqs.filter((f) => active === null || f.faq_category_id === active), [faqs, active]);
  return (
    <Page header={<BackHeader title={t("profile_faq_title", "FAQ")} />}>
      <BaseListsGate names={["faqs", "faq_categories"]} placeholder={<SkeletonList count={5} variant="row" label={t("loading_base_faqs", "Loading FAQs")} />}>
        <div className="stack">
          <div className="chip-scroll">
            <button type="button" className={`check-chip ${active === null ? "on" : ""}`} onClick={() => setActive(null)}>{t("general_all", "All")}</button>
            {categories.map((c) => (
              <button key={c.id} type="button" className={`check-chip ${active === c.id ? "on" : ""}`} onClick={() => setActive(c.id)}>{pick(c.translations)?.title}</button>
            ))}
          </div>
          {shown.map((f) => {
            const tr = pick(f.translations);
            return (
              <details key={f.id} className="faq">
                <summary><span>{tr?.question}</span><Icon name="ic_chevron_down" size={18} tint="var(--primary)" className="faq-chevron" /></summary>
                {/* Answers are authored HTML from the Carezaar admin. */}
                <div className="faq-answer" dangerouslySetInnerHTML={{ __html: sanitizeHtml(tr?.answer ?? "") }} />
              </details>
            );
          })}
        </div>
      </BaseListsGate>
    </Page>
  );
}

/* ----------------------------------------------------------- Report an issue */

export function ReportIssueScreen() {
  const { t, label } = useI18n();
  const { items, find } = useBaseData();
  const issueTypes = useBaseLists(["issuetypes"]);
  const typeName = (i: Issue) => (i.issuetype_id ? label(find("issuetypes", i.issuetype_id)) : "");
  const { act, toast, messageOf } = useFeedback();
  const submitting = useGuarded("issue:create");
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<number | "other">("other");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const load = () => {
    setError(null);
    userService.issues().then((all) => {
      // An issue whose answer was lost but which the list already shows went through: its
      // pending key is retired, so a later issue with the same words gets a key of its own.
      // (Not while one is being filed: that submission settles its own key.)
      if (!isGuarded("issue:create")) {
        const settled = Date.now() - SETTLED_AFTER_MS;
        retireCarriedOut("issue", "issues", (r) => r.created < settled && all.some((i) => i.id > (r.after ?? 0) && i.description === r.draft
          && (r.context?.issuetype != null ? i.issuetype_id === r.context.issuetype : r.context?.title != null && i.title === r.context.title)));
      }
      setIssues(all);
    }).catch(setError);
  };
  // Loaded once on mount (load uses only stable setters and the service).
  useEffect(load, []);

  const submit = async () => {
    const problem = (type === "other" ? required(subject, t("report_an_issue_subject_label", "Subject")) : null)
      ?? required(description, t("report_an_issue_description_label", "Description"));
    if (problem) { toast(problem); return; }
    try {
      const created = await act("issue:create", () => userService.createIssue({
        issuetypeId: type === "other" ? null : type, title: type === "other" ? subject.trim() : null, description: description.trim(),
      }, issues ? Math.max(0, ...issues.map((i) => i.id)) : undefined));
      // The server's answer is the issue as filed: shown at once, not after another load,
      // so a later failed refresh can't make it look unsent.
      setIssues((all) => [created, ...(all ?? []).filter((i) => i.id !== created.id)]);
      setError(null);
      setOpen(false); setSubject(""); setDescription(""); setType("other");
    } catch (e) {
      // No answer: the issue may have been filed. The form stays as it is; Submit sends the
      // same request with the same Idempotency-Key, so the server files it at most once.
      toast(messageOf(e));
    }
  };

  return (
    <Page header={<BackHeader title={t("report_an_issue_title", "Report An Issue")} />}>
      {error && !issues ? <ErrorState message={messageOf(error)} error={error} onRetry={load} /> : !issues ? <SkeletonList count={3} variant="issue" label={t("loading_user_issues_get", "Getting reported issues")} />
        : issues.length === 0 ? <EmptyState title={t("report_an_issue_no_issues_found", "No issues found")}
            message={t("report_an_issue_empty_description", "")} illustration="illus_report" />
        : (
          <ul className="card-list">
            {issues.map((i) => (
              <li key={i.id}><article className="issue-card">
                {/* Until the issue types arrive, a typed issue shows its own title (the support
                    history never waits for them). */}
                <header><h2>{typeName(i) || i.title || t("report_an_issue_title", "Report An Issue")}</h2>
                  <span className={`status-pill ${i.is_replied ? "replied" : "pending"}`}>
                    <Icon name={i.is_replied ? "ic_check_circle" : "ic_timer"} size={16} tint={i.is_replied ? "var(--success)" : "var(--primary)"} />
                    {i.is_replied ? t("report_an_issue_status_resolved", "Resolved") : t("report_an_issue_status_pending", "Pending")}
                  </span></header>
                {typeName(i) && i.title && <p><b>{i.title}</b></p>}
                <p dir="auto">{i.description}</p>
                <p className="muted small end">{asStored(i.created_at)}</p>
                {i.reply && (
                  <div className="admin-reply"><b>{t("report_an_issue_admin", "Administrator")}</b><p dir="auto">{i.reply}</p>
                    <p className="small end">{i.replied_at}</p></div>
                )}
              </article></li>
            ))}
          </ul>
        )}
      <button type="button" className="fab" onClick={() => setOpen(true)} aria-label={t("report_an_issue_title", "Report An Issue")}>
        <Icon name="ic_add_circle" size={34} tint="#fff" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy="issue-title" title={<><Icon name="ic_upload" size={20} tint="var(--text)" /> {t("report_an_issue_title", "Report An Issue")}</>}>
        <div className="stack">
          <Field label={t("report_an_issue_type_label", "Issue type")}>
            <select aria-label={t("report_an_issue_type_label", "Issue type")} value={String(type)}
              onChange={(e) => setType(e.target.value === "other" ? "other" : Number(e.target.value))}>
              {items("issuetypes").map((it) => <option key={it.id} value={it.id}>{label(it)}</option>)}
              <option value="other">{t("report_an_issue_type_other", "Other")}</option>
            </select>
          </Field>
          {/* "Other" needs no issue type, so filing never waits for them; the others follow. */}
          {issueTypes.state === "loading" && <InlineProgress label={t("loading_base_issuetypes", "Loading issue types")} />}
          {issueTypes.state === "failed" && (
            <p className="field-message" role="alert">{t("general_network_title", "Cannot communicate with server.")}{" "}
              <button type="button" className="link" onClick={issueTypes.retry}>{t("general_try_again", "Try Again")}</button></p>
          )}
          {type === "other" && (
            <TextField label={t("report_an_issue_subject_label", "Subject")} required value={subject}
              onChange={(e) => setSubject(e.target.value)} placeholder={t("report_an_issue_subject_placeholder", "Enter your issue subject...")} />
          )}
          <TextArea label={t("report_an_issue_description_label", "Description")} required value={description}
            onChange={(e) => setDescription(e.target.value)} placeholder={t("report_an_issue_description_placeholder", "Write your issue here...")} />
          <Button loading={submitting} onClick={() => void submit()}>{t("report_an_issue_submit_button", "Submit")}</Button>
        </div>
      </Dialog>
    </Page>
  );
}

/* ---------------------------------------------------------- Change language */

export function ChangeLanguageScreen() {
  const goBack = useGoBack("/main/profile");
  const { t, languages, languageId, setLanguage } = useI18n();
  const [choice, setChoice] = useState(languageId);
  const flag: Record<string, string> = { en: "ic_flag_us", sp: "ic_flag_es", ar: "ic_flag_sa", fr: "ic_flag_fr", fa: "ic_flag_ir", cn: "ic_flag_cn", in: "ic_flag_in", ru: "ic_flag_ru" };
  return (
    <Page header={<BackHeader title={t("settings_change_language_title", "Change Language")} />}
      footer={<Button onClick={() => {
        const next = languages.find((l) => l.id === choice);
        if (next) setLanguage(next);
        goBack();
      }}>{t("settings_change_language_save", "Save Changes")}</Button>}>
      <div className="stack">
        <div className="info-card"><Icon name="ic_language" size={34} tint="var(--primary-dark)" />
          <div><b>{t("settings_change_language_app_title", "App Language")}</b><p className="small">{t("settings_change_language_app_description", "")}</p></div></div>
        <h2 className="language-list-title">{t("settings_change_language_available", "Available Languages")}</h2>
        <BaseListsGate names={["languages"]} placeholder={<SkeletonList count={4} variant="row" label={t("loading_base_languages", "Loading languages")} />}>
        <ul className="menu-card" role="radiogroup">
          {languages.map((l) => (
            <li key={l.id}><button type="button" role="radio" aria-checked={choice === l.id} className="menu-row" onClick={() => setChoice(l.id)}>
              <Icon name={flag[l.code]} size={30} /><span className="menu-text"><b>{l.name}</b></span>
              <Icon name={choice === l.id ? "ic_radiobutton_on" : "ic_radiobutton_off"} size={24} tint="var(--primary)" />
            </button></li>
          ))}
        </ul>
        </BaseListsGate>
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------- Change password */

/** Changes the password, then returns to the signed-out start screen. */
export function ChangePasswordScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { act, toast, messageOf } = useFeedback();
  const { user, signOut } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [confirming, setConfirming] = useState(false);
  const changing = useGuarded("auth:password");
  // As on Android: all three fields nonblank and the new passwords identical. Strength is the
  // API's to judge, and its answer is shown.
  const valid = canSubmitPasswordChange(current, next, confirmation);
  const submit = async () => {
    setConfirming(false);
    const email = user?.email;
    if (!email) return;
    // After the password changes, the person is signed out and taken back to the start,
    // where they sign in with the new password, as on Android (parity review v4.0, O1).
    // The server ends every session of the account at that moment anyway.
    try {
      await act("auth:password", async () => {
        try {
          await userService.changePassword(current, next);
        } catch (e) {
          // No answer: the change may have gone through. It is not sent again; signing in
          // with the new password (a check, not a repeat) shows whether it did. A refusal
          // (renewal unreachable) is certain: nothing changed, so there's nothing to check.
          if (e instanceof RefusedWhileRenewalUnreachableError) throw e;
          if (!(e instanceof ApiError && (e.kind === "network" || e.kind === "timeout"))) throw e;
          try { await authService.login(email, next); } catch { throw e; }
        }
      });
    } catch (e) {
      toast(messageOf(e));
      return;
    }
    setCurrent(""); setNext(""); setConfirmation("");
    await act("auth:logout", signOut).catch(() => undefined);
    navigate("/intro", { replace: true });
  };
  return (
    <Page header={<BackHeader title={t("settings_change_password_title", "Change Password")} />}
      footer={<Button disabled={!valid} loading={changing} onClick={() => setConfirming(true)}>{t("settings_change_password_change_password", "Change Password")}</Button>}>
      <div className="stack">
        <TextField label={t("settings_change_password_current_password", "Current Password")} required icon="ic_lock" type="password"
          autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)}
          placeholder={t("settings_change_password_current_password_placeholder", "Enter your current password...")} />
        <TextField label={t("settings_change_password_new_password", "New Password")} required icon="ic_lock" type="password"
          autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)}
          placeholder={t("settings_change_password_new_password_placeholder", "Enter your new password...")} />
        <RuleChips rules={passwordRules(next, CHANGE_PASSWORD_SPECIAL_CHARACTERS)} />
        <TextField label={t("settings_change_password_confirm_password", "Confirm Password")} required icon="ic_lock" type="password"
          autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)}
          error={confirmation && confirmation !== next ? t("signup_credentials_password_match", "Passwords do not match.") : null}
          placeholder={t("settings_change_password_confirm_password_placeholder", "Confirm your new password...")} />
      </div>
      <Dialog open={confirming} onClose={() => setConfirming(false)} labelledBy="cp-title" title={t("settings_change_password_dialog_title", "Are you sure?")}>
        <p>{t("settings_change_password_dialog_message", "")}</p>
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => setConfirming(false)}>{t("settings_change_password_dialog_deny", "Cancel")}</Button>
          <Button onClick={() => void submit()}>{t("settings_change_password_dialog_confirm", "Confirm")}</Button>
        </div>
      </Dialog>
    </Page>
  );
}

/* ----------------------------------------------------------- Delete account */

export function DeleteAccountScreen() {
  const navigate = useNavigate();
  const goBack = useGoBack("/help");
  const { t, label } = useI18n();
  const { items } = useBaseData();
  const { act, toast, messageOf } = useFeedback();
  const { signOut, role } = useSession();
  const [reason, setReason] = useState<number | "">("");
  // Reason codes are role-prefixed (`client_…`, `caregiver_…`); show the user's own.
  const own = items("reasons").filter((r) => r.code?.startsWith(`${role ?? "client"}_`));
  const reasons = own.length ? own : items("reasons");
  const [aware, setAware] = useState(false);
  const deleting = useGuarded("account:delete");
  const lose = ["delete_account_data_profile", "delete_account_data_matches", "delete_account_data_messages", "delete_account_data_favorites", "delete_account_data_settings"];
  const submit = async () => {
    try {
      if (reason === "") return;
      await act("account:delete", () => userService.deleteAccount(reason));
      await signOut();
      navigate("/intro", { replace: true });
    } catch (e) {
      // No answer: the account may already be deleted. It isn't sent again; reading the
      // account shows which (a deleted account's sign-in is refused and the app signs out).
      if (e instanceof ApiError && (e.kind === "network" || e.kind === "timeout")) {
        try { await authService.currentUser(); } catch (check) {
          if (check instanceof ApiError && (check.kind === "unauthenticated" || check.kind === "forbidden")) {
            await signOut(); navigate("/intro", { replace: true }); return;
          }
        }
      }
      toast(messageOf(e));
    }
  };
  return (
    <Page header={<BackHeader title={t("delete_account_title", "Delete Account")} onBack={() => goBack()} />}
      footer={<div className="dialog-actions">
        <Button variant="outline" onClick={() => goBack()}>{t("delete_account_action_cancel", "Cancel")}</Button>
        <Button variant="danger" disabled={!aware || reason === ""} loading={deleting} onClick={() => void submit()}>{t("delete_account_action_delete", "Delete Account")}</Button>
      </div>}>
      <div className="stack">
        <div className="center"><Icon name="ic_trash" size={72} tint="var(--error)" />
          <h2 className="title">{t("delete_account_subtitle", "Delete Your Account?")}</h2>
          <p className="muted">{t("delete_account_description", "")}</p></div>
        <div className="alert-card"><Icon name="ic_alert" size={28} tint="var(--error)" />
          <div><b>{t("delete_account_alert_title", "This action cannot be undone")}</b><p className="small">{t("delete_account_alert_description", "")}</p></div></div>
        <section className="pref-card"><header><h3>{t("delete_account_data_title", "What you will lose")}</h3></header>
          <ul className="bullet-list">{lose.map((k) => <li key={k}><Icon name="ic_clear_circle" size={18} tint="var(--error)" />{t(k, "")}</li>)}</ul></section>
        {/* A reason is required, as on Android (its delete call takes a non-optional reason id). */}
        <BaseListsGate names={["reasons"]} placeholder={<SkeletonList count={1} variant="issue" label={t("loading_base_reasons", "Loading reasons")} />}>
        <Field label={t("delete_account_reason_title", "Why are you deleting your account?")} required
          error={aware && reason === "" ? t("general_required", "This field is required.") : null}>
          <select aria-label={t("delete_account_reason_title", "Reason")} value={String(reason)}
            onChange={(e) => setReason(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">{t("delete_account_reason_placeholder", "Select a reason")}</option>
            {reasons.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
          </select>
        </Field>
        </BaseListsGate>
        <Checkbox checked={aware} onChange={setAware}>{t("delete_account_confirm", "I am aware of the consequences of this decision.")}</Checkbox>
      </div>
    </Page>
  );
}
