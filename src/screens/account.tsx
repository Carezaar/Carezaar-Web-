import { localTime } from "../app/serverTime";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "../navigation/back";
import { ApiError } from "../api/errors";
import { baseService, userService } from "../api/services";
import type { AppNotification, Faq, FaqCategory, Issue, User } from "../api/types";
import { useSession } from "../auth/SessionContext";
import { useBaseData } from "../app/baseData";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { usePaged } from "../app/usePaged";
import { isPasswordValid, passwordRules, required } from "../validation/validation";
import { BackHeader, Page } from "../ui/layout";
import { Avatar, Button, cardLink, Checkbox, Dialog, EmptyState, ErrorState, Field, InfiniteSentinel, Spinner, TextArea, TextField } from "../ui/kit";
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
  const { run, messageOf } = useFeedback();
  const list = usePaged(async (page) => {
    const work = userService.notifications(page);
    return page === 1 ? run(`${t("loading_user_notifications_get", "Getting notifications - Page")} ${page}`, () => work) : work;
  }, []);
  const { markChecked } = useNotifications();
  useEffect(() => markChecked, [markChecked]);

  const open = async (n: AppNotification) => {
    if (!n.seen_at) {
      list.mutate((all) => all.map((x) => (x.id === n.id ? { ...x, seen_at: "now" } : x)));
      void userService.markNotificationSeen(n.id).catch(() => undefined);
    }
    const code = find("subjects", n.subject_id)?.code ?? "";
    if (code.startsWith("chat") && n.chat) navigate(`/chat/${n.chat.id}`);
    else if (code.includes("match")) navigate("/profile/matches");
    else if (n.partner) navigate(partnerPath(n.partner));
  };

  return (
    <Page header={<BackHeader title={t("general_notifications", "Notifications")} />}>
      {list.error && list.items.length === 0 ? <ErrorState message={messageOf(list.error)} error={list.error} onRetry={() => void list.reload()} />
        : !list.loading && list.items.length === 0 ? <EmptyState title={t("general_notifications", "Notifications")} illustration="ic_notification_off" tint="var(--primary)" />
        : (
          <ul className="row-list">
            {list.items.map((n) => (
              <li key={n.id}>
                {/* Figma v2 frame 738:11732: dot, subject icon, name + event, date, chevron. */}
                <button type="button" className="notif-row" onClick={() => void open(n)}>
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
                    {n.partner && <b dir="auto">{n.partner.first_name} {n.partner.last_name}</b>}
                    <span>{label(find("subjects", n.subject_id))}</span>
                  </span>
                  <span className="notif-when">
                    <Icon name="ic_clock" size={12} tint="var(--text-secondary)" />
                    <span className="notif-date">{localTime(n.created_at).split(" ").map((part) => <span key={part}>{part}</span>)}</span>
                  </span>
                  <Icon name="ic_chevron_forward" size={16} tint="var(--text-secondary)" className="flip-rtl notif-chevron" />
                </button>
              </li>
            ))}
          </ul>
        )}
      <InfiniteSentinel active={list.hasMore && !list.loading} onVisible={list.loadMore} />
    </Page>
  );
}

/* ---------------------------------------------------------------- Favorites */

export function FavoritesScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { run, act, toast, messageOf } = useFeedback();
  const list = usePaged(async (page) => {
    const work = userService.bookmarks(page);
    return page === 1 ? run(`${t("loading_favorite_get", "Getting favorites - Page")} ${page}`, () => work) : work;
  }, []);
  const remove = async (u: User) => {
    try {
      await act(t("loading_favorite_delete", "Removing from favorite list"), () => userService.removeBookmark(u.id));
      list.mutate((all) => all.filter((x) => x.id !== u.id));
    } catch (e) { toast(messageOf(e)); }
  };
  return (
    <Page header={<BackHeader title={t("profile_favorites_title", "Favorites")} />}>
      <div className="fav-head"><span><Icon name="ic_favorite_on" size={44} tint="var(--primary-dark)" /></span></div>
      {list.error && list.items.length === 0 ? <ErrorState message={messageOf(list.error)} error={list.error} onRetry={() => void list.reload()} />
        : !list.loading && list.items.length === 0 ? <EmptyState title={t("profile_favorites_title", "Favorites")} illustration="ic_favorite_off" tint="var(--primary)" />
        : (
          <ul className="card-list">
            {list.items.map((u) => (
              <li key={u.id}>
                <article className="fav-card" {...cardLink(() => navigate(partnerPath(u)), `${u.first_name} ${u.last_name}`)}>
                  <Avatar src={u.photo} size={96} />
                  <div className="fav-text"><h3>{u.first_name} {u.last_name}</h3><p className="clamp-3" dir="auto">{u.bio}</p></div>
                  <div className="match-side">
                    <button type="button" className="icon-btn" aria-label="Remove from favorites"
                      onClick={(e) => { e.stopPropagation(); void remove(u); }}>
                      <Icon name="ic_favorite_on" size={28} tint="var(--error)" />
                    </button>
                    <Icon name="ic_chevron_forward" size={20} tint="var(--text-secondary)" className="flip-rtl" />
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      <InfiniteSentinel active={list.hasMore && !list.loading} onVisible={list.loadMore} />
    </Page>
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
        <button type="button" className="menu-row card" onClick={() => navigate("/report-issue")}>
          <span className="menu-icon"><Icon name="ic_issue" size={30} tint="var(--primary-dark)" /></span>
          <span className="menu-text"><b>{t("contact_support_issue_title", "Report an Issue")}</b>
            <small>{t("contact_support_issue_description", "")}</small></span>
          <Icon name="ic_chevron_forward" size={20} tint="var(--text-secondary)" className="flip-rtl" />
        </button>
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------------------- FAQ */

/** Android hardcodes "All"; the content table has no slug for it. */
const ALL_LABEL: Record<string, string> = {
  en: "All", fr: "Tous", sp: "Todos", ar: "الكل", fa: "همه", ru: "Все", cn: "全部", in: "सभी",
};

export function FaqScreen() {
  const { t, languageId, languageCode } = useI18n();
  const { messageOf } = useFeedback();
  const [faqs, setFaqs] = useState<Faq[] | null>(null);
  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = () => {
    setError(null);
    Promise.all([baseService.faqs(), baseService.faqCategories()])
      .then(([f, c]) => { setFaqs(f); setCategories(c); }).catch(setError);
  };
  useEffect(load, []);
  const pick = <T extends { language_id: number }>(ts: T[]) => ts.find((x) => x.language_id === languageId) ?? ts.find((x) => x.language_id === 1) ?? ts[0];
  const shown = useMemo(() => (faqs ?? []).filter((f) => active === null || f.faq_category_id === active), [faqs, active]);
  return (
    <Page header={<BackHeader title={t("profile_faq_title", "FAQ")} />}>
      {error ? <ErrorState message={messageOf(error)} error={error} onRetry={load} /> : !faqs ? <Spinner /> : (
        <div className="stack">
          <div className="chip-scroll">
            <button type="button" className={`check-chip ${active === null ? "on" : ""}`} onClick={() => setActive(null)}>{ALL_LABEL[languageCode] ?? "All"}</button>
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
      )}
    </Page>
  );
}

/* ----------------------------------------------------------- Report an issue */

export function ReportIssueScreen() {
  const { t, label } = useI18n();
  const { items, find } = useBaseData();
  const { run, act, toast, messageOf, unavailable } = useFeedback();
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<number | "other">("other");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const load = () => {
    setError(null);
    run(t("loading_user_issues_get", "Getting reported issues"), () => userService.issues()).then(setIssues).catch(setError);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load the list once on mount
  useEffect(load, []);

  const submit = async () => {
    const problem = (type === "other" ? required(subject, t("report_an_issue_subject_label", "Subject")) : null)
      ?? required(description, t("report_an_issue_description_label", "Description"));
    if (problem) { toast(problem); return; }
    try {
      await act(t("loading_user_issues_create", "Reporting a new issue"), () => userService.createIssue({
        issuetypeId: type === "other" ? null : type, title: type === "other" ? subject.trim() : null, description: description.trim(),
      }));
      setOpen(false); setSubject(""); setDescription(""); setType("other");
      load();
    } catch (e) {
      toast(e instanceof ApiError && e.isServiceFault ? unavailable(t("report_an_issue_title", "Report An Issue"))
        : e instanceof ApiError && e.kind === "validation" ? Object.values(e.fields).flat()[0] ?? e.message : messageOf(e));
    }
  };

  return (
    <Page header={<BackHeader title={t("report_an_issue_title", "Report An Issue")} />}>
      {error ? <ErrorState message={messageOf(error)} error={error} onRetry={load} /> : !issues ? <Spinner />
        : issues.length === 0 ? <EmptyState title={t("report_an_issue_no_issues_found", "No issues found")}
            message={t("report_an_issue_empty_description", "")} illustration="illus_report" />
        : (
          <ul className="card-list">
            {issues.map((i) => (
              <li key={i.id}><article className="issue-card">
                <header><h3>{i.issuetype_id ? label(find("issuetypes", i.issuetype_id)) : i.title}</h3>
                  <span className={`status-pill ${i.is_replied ? "replied" : "pending"}`}>
                    <Icon name={i.is_replied ? "ic_check_circle" : "ic_timer"} size={16} tint={i.is_replied ? "var(--success)" : "var(--primary)"} />
                    {i.is_replied ? t("report_an_issue_status_resolved", "Resolved") : t("report_an_issue_status_pending", "Pending")}
                  </span></header>
                {i.issuetype_id && i.title && <p><b>{i.title}</b></p>}
                <p dir="auto">{i.description}</p>
                <p className="muted small end">{localTime(i.created_at)}</p>
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
          {type === "other" && (
            <TextField label={t("report_an_issue_subject_label", "Subject")} required value={subject}
              onChange={(e) => setSubject(e.target.value)} placeholder={t("report_an_issue_subject_placeholder", "Enter your issue subject...")} />
          )}
          <TextArea label={t("report_an_issue_description_label", "Description")} required value={description}
            onChange={(e) => setDescription(e.target.value)} placeholder={t("report_an_issue_description_placeholder", "Write your issue here...")} />
          <Button onClick={() => void submit()}>{t("report_an_issue_submit_button", "Submit")}</Button>
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
        <h3>{t("settings_change_language_available", "Available Languages")}</h3>
        <ul className="menu-card" role="radiogroup">
          {languages.map((l) => (
            <li key={l.id}><button type="button" role="radio" aria-checked={choice === l.id} className="menu-row" onClick={() => setChoice(l.id)}>
              <Icon name={flag[l.code]} size={30} /><span className="menu-text"><b>{l.name}</b></span>
              <Icon name={choice === l.id ? "ic_radiobutton_on" : "ic_radiobutton_off"} size={24} tint="var(--primary)" />
            </button></li>
          ))}
        </ul>
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------- Change password */

/** Calls `users/password/change` as Android does; the server's answer is shown. */
export function ChangePasswordScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { act, toast, messageOf, unavailable } = useFeedback();
  const { signOut } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [confirming, setConfirming] = useState(false);
  const valid = current !== "" && isPasswordValid(next) && next === confirmation;
  const submit = async () => {
    setConfirming(false);
    try {
      await act(t("loading_user_password_change", "Changing password"), () => userService.changePassword(current, next));
      // Android restarts at its splash screen after a password change; the web signs out and opens Intro.
      await signOut();
      navigate("/intro", { replace: true });
    } catch (e) {
      toast(e instanceof ApiError && e.isServiceFault ? unavailable(t("settings_change_password_title", "Change Password")) : messageOf(e));
    }
  };
  return (
    <Page header={<BackHeader title={t("settings_change_password_title", "Change Password")} />}
      footer={<Button disabled={!valid} onClick={() => setConfirming(true)}>{t("settings_change_password_change_password", "Change Password")}</Button>}>
      <div className="stack">
        <TextField label={t("settings_change_password_current_password", "Current Password")} required icon="ic_lock" type="password"
          autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)}
          placeholder={t("settings_change_password_current_password_placeholder", "Enter your current password...")} />
        <TextField label={t("settings_change_password_new_password", "New Password")} required icon="ic_lock" type="password"
          autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)}
          placeholder={t("settings_change_password_new_password_placeholder", "Enter your new password...")} />
        <RuleChips rules={passwordRules(next)} />
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
  const { act, toast, messageOf, unavailable } = useFeedback();
  const { signOut, role } = useSession();
  const [reason, setReason] = useState<number | "">("");
  // Reason codes are role-prefixed (`client_…`, `caregiver_…`); show the user's own.
  const own = items("reasons").filter((r) => r.code?.startsWith(`${role ?? "client"}_`));
  const reasons = own.length ? own : items("reasons");
  const [aware, setAware] = useState(false);
  const lose = ["delete_account_data_profile", "delete_account_data_matches", "delete_account_data_messages", "delete_account_data_favorites", "delete_account_data_settings"];
  const submit = async () => {
    try {
      if (reason === "") return;
      await act(t("loading_deleting_user_account", "Deleting user account"), () => userService.deleteAccount(reason));
      await signOut();
      navigate("/intro", { replace: true });
    } catch (e) {
      // Until 2026-10-01 the server rejected every reason id (BE-04); a refusal still gets the support message.
      toast(e instanceof ApiError && (e.isServiceFault || e.fieldError("reason_id"))
        ? unavailable(t("delete_account_title", "Delete Account")) : messageOf(e));
    }
  };
  return (
    <Page header={<BackHeader title={t("delete_account_title", "Delete Account")} onBack={() => goBack()} />}
      footer={<div className="dialog-actions">
        <Button variant="outline" onClick={() => goBack()}>{t("delete_account_action_cancel", "Cancel")}</Button>
        <Button variant="danger" disabled={!aware || reason === ""} onClick={() => void submit()}>{t("delete_account_action_delete", "Delete Account")}</Button>
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
        <Field label={t("delete_account_reason_title", "Why are you deleting your account?")} required
          error={aware && reason === "" ? t("general_required", "This field is required.") : null}>
          <select aria-label={t("delete_account_reason_title", "Reason")} value={String(reason)}
            onChange={(e) => setReason(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">{t("delete_account_reason_placeholder", "Select a reason")}</option>
            {reasons.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
          </select>
        </Field>
        <Checkbox checked={aware} onChange={setAware}>{t("delete_account_confirm", "I am aware of the consequences of this decision.")}</Checkbox>
      </div>
    </Page>
  );
}
