import { localTime } from "../app/serverTime";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { caregiverService, clientService, userService } from "../api/services";
import type { CaregiverBrief, ClientBrief, MatchSort, PartnerUser } from "../api/types";
import { formatDistance } from "../api/match";
import { useSession } from "../auth/SessionContext";
import { useBaseData } from "../app/baseData";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { usePaged } from "../app/usePaged";
import { takeFirstMatches } from "../app/matchesPrefetch";
import { AppHeader, BottomNav, Hero } from "../ui/layout";
import { Avatar, Button, cardLink, Dialog, EmptyState, ErrorState, InfiniteSentinel, PhotoBox, Spinner } from "../ui/kit";
import { Icon } from "../ui/Icon";
import { useIsDesktop } from "../ui/frames";
import { useNotifications } from "../app/notifications";

/** `Main` — the three-tab shell. */
export function MainScreen() {
  const { tab = "matches" } = useParams();
  const { unread } = useNotifications();
  if (!["matches", "messages", "profile"].includes(tab)) return <Navigate to="/main/matches" replace />;
  return (
    <div className="page main-shell">
      <AppHeader unread={unread} />
      <main className="page-body flush">
        {tab === "matches" && <MatchesTab />}
        {tab === "messages" && <MessagesTab />}
        {tab === "profile" && <ProfileTab />}
      </main>
      <BottomNav />
    </div>
  );
}

/* ----------------------------------------------------------------- Matches */

type Card = { id: string; user: PartnerUser; min: number | null; max: number | null; distance: number;
  clienttypeId?: number };

function MatchesTab() {
  const navigate = useNavigate();
  const { role } = useSession();
  const { t, label } = useI18n();
  const { find } = useBaseData();
  const { run, messageOf } = useFeedback();
  const [sort, setSort] = useState<MatchSort>("distance");
  const [sortOpen, setSortOpen] = useState(false);
  const [headerTypeId, setHeaderTypeId] = useState<number | null>(null);
  const isClient = role === "client";

  const list = usePaged<Card>(async (page) => {
    const label = `${t("loading_matches", "Getting list of matches - Page")} ${page}`;
    // Page 1 in the default sort may already be in flight (started alongside auth/info).
    const first = page === 1 && sort === "distance";
    const work: Promise<{ result: Card[]; meta: import("../api/types").ApiMeta | null }> = isClient
      ? ((first && takeFirstMatches<Awaited<ReturnType<typeof clientService.matches>>>("client")) || clientService.matches(sort, page)).then(({ result, meta }) => ({
          meta, result: result.map((c: CaregiverBrief) => ({ id: c.id, user: c.user, min: c.salary_min, max: c.salary_max, distance: c.distance })) }))
      : ((first && takeFirstMatches<Awaited<ReturnType<typeof caregiverService.matches>>>("caregiver")) || caregiverService.matches(sort, page)).then(({ result, meta }) => ({
          meta, result: result.map((c: ClientBrief) => ({ id: c.id, user: c.user, min: c.salary_min, max: c.salary_max, distance: c.distance, clienttypeId: c.clienttype_id })) }));
    return page === 1 ? run(label, () => work) : work;
  }, [sort, isClient]);

  // The hero follows the care type: header_senior, header_child, …
  useEffect(() => {
    let current = true;
    setHeaderTypeId(null);
    const load = isClient
      ? clientService.profile().then((p) => p.clienttype_id)
      : caregiverService.profile().then((p) => p.clienttype_ids[0]);
    load.then((id) => { if (current) setHeaderTypeId(id ?? null); }).catch(() => undefined);
    return () => { current = false; };
  }, [isClient]);
  const headerIcon = find("clienttypes", headerTypeId)?.icon;
  const headerType = headerIcon ? headerIcon.replace("client_", "header_") : null;

  const prefix = isClient ? "client" : "caregiver";
  return (
    <>
      <Hero image={headerType ?? "bg_matches"} icon="ic_matches_off"
        title={t(`${prefix}_matches_page_title`, "My Matches")}
        subtitle={t(`${prefix}_matches_page_description`, "")} />
      <section className="prefs-banner">
        <span className="prefs-banner-icon"><Icon name="ic_tune" size={30} tint="var(--primary)" /></span>
        <div>
          <strong>{t(`${prefix}_matches_preferences_title`, "Looking for something different?")}</strong>
          <p>{t(`${prefix}_matches_preferences_description`, "")}</p>
        </div>
        <Button onClick={() => navigate(isClient ? "/preferences" : "/skills")}>
          {t(`${prefix}_matches_preferences_button`, "Edit preferences")}
        </Button>
      </section>
      <div className="list-head">
        <strong>{t(`${prefix}_matches_all_matches`, "All Matches")} {list.total !== null && `(${list.total})`}</strong>
        <button type="button" className="sort-button" onClick={() => setSortOpen(true)}>
          <Icon name="ic_sort" size={20} tint="var(--text-secondary)" />
          {t(`${prefix}_matches_sort`, "Sort")} ({t(`${prefix}_matches_sort_${sort}`, sort)})
        </button>
      </div>
      {list.error && list.items.length === 0 ? (
        <ErrorState message={messageOf(list.error)} error={list.error} onRetry={() => void list.reload()} retryLabel={t("general_try_again", "Try Again")} />
      ) : !list.loading && list.items.length === 0 ? (
        <EmptyState title={`${t(`${prefix}_matches_all_matches`, "All Matches")} (0)`} illustration="illus_chat" />
      ) : (
        <ul className="card-list">
          {list.items.map((c) => (
            <li key={c.id}>
              <article className="match-card" {...cardLink(() => navigate(isClient ? `/caregivers/${c.id}` : `/clients/${c.id}`), `${c.user.first_name} ${c.user.last_name}`)}>
                <PhotoBox className="match-photo" src={c.user.photo} />
                <div className="match-body">
                  <div className="match-title">
                    <h3>{c.user.first_name} {c.user.last_name}</h3>
                    {!isClient && c.min !== null && <span className="price"><bdi className="range">${c.min} - ${c.max}</bdi></span>}
                  </div>
                  <p className="meta"><Icon name="ic_distance" size={20} tint="var(--primary)" />
                    <b>{formatDistance(c.distance)}</b> {t("general_miles_away", "mile(s) away")}</p>
                  {isClient ? (
                    <p className="meta"><Icon name="ic_usd_circle" size={20} tint="var(--primary)" />
                      <b><bdi className="range">{c.min} - {c.max}</bdi></b> {t("client_details_usd_per_hour", "USD per hour")}</p>
                  ) : (
                    <p className="meta chip-meta"><Icon name={find("clienttypes", c.clienttypeId)?.icon} size={26} />
                      {label(find("clienttypes", c.clienttypeId))}</p>
                  )}
                </div>
                <div className="match-side">
                  <Icon name="ic_chevron_forward" size={20} tint="var(--text-secondary)" className="flip-rtl" />
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      {list.loading && list.items.length > 0 && <Spinner />}
      <InfiniteSentinel active={list.hasMore && !list.loading} onVisible={list.loadMore} />
      <Dialog open={sortOpen} onClose={() => setSortOpen(false)} title={t(`${prefix}_matches_sort`, "Sort")} labelledBy="sort-title">
        <div className="stack-sm">
          {(["distance", "pay"] as MatchSort[]).map((s) => (
            <button key={s} type="button" className={`option-row ${s === sort ? "on" : ""}`}
              onClick={() => { setSort(s); setSortOpen(false); }}>
              <Icon name={s === sort ? "ic_radiobutton_on" : "ic_radiobutton_off"} size={22} tint="var(--primary)" />
              <span>{t(`${prefix}_matches_sort_${s}`, s)}</span>
            </button>
          ))}
        </div>
      </Dialog>
    </>
  );
}

/* ---------------------------------------------------------------- Messages */

function MessagesTab() {
  const desktop = useIsDesktop();
  // Already inside MainScreen's <main>.
  return desktop ? <MessagesDesktop selectedId={null} nested /> : (
    <>
      <MessagesHero />
      <ChatList selectedId={null} />
    </>
  );
}

function MessagesHero() {
  const { t } = useI18n();
  return (
    <Hero image="bg_messages" icon="ic_messages_off" title={t("messages_title", "Messages")}
      subtitle={t("messages_description", "All your conversations in one place")} />
  );
}

/** Desktop Messages (frames 766:15 / 766:18): the list stays on the left and the
 *  open conversation — or a prompt to pick one — fills the right. */
export function MessagesDesktop({ selectedId, nested = false, children }: { selectedId: number | null; nested?: boolean; children?: ReactNode }) {
  const { t } = useI18n();
  const Split = nested ? "div" : "main";
  return (
    <div className="page main-shell">
      <MessagesHero />
      <Split className="messages-split">
        <div className="messages-list"><ChatList selectedId={selectedId} /></div>
        <div className="messages-pane">
          {children ?? (
            <div className="select-conversation">
              <img src="/assets/desktop-select-message-illustration.jpg" alt="" width={124} height={129} />
              <h2>{t("messages_select_title", "Select a conversation")}</h2>
              <p className="muted">{t("messages_select_description", "Choose a message from the list to view and continue the conversation.")}</p>
            </div>
          )}
        </div>
      </Split>
    </div>
  );
}

/** Fired after sending, so a visible chat list refreshes its last-message preview. */
export const CHATS_CHANGED = "carezaar:chats-changed";

function ChatList({ selectedId }: { selectedId: number | null }) {
  const navigate = useNavigate();
  const { role } = useSession();
  const { t } = useI18n();
  const { run, messageOf } = useFeedback();
  const list = usePaged(async (page) => {
    const work = userService.chats(page);
    return page === 1 ? run(`${t("loading_chat_get_all", "Getting list of chats - Page")} ${page}`, () => work) : work;
  }, []);
  const { reload } = list;
  useEffect(() => {
    const onChange = () => void reload();
    window.addEventListener(CHATS_CHANGED, onChange);
    return () => window.removeEventListener(CHATS_CHANGED, onChange);
  }, [reload]);
  return (
    <>
      {list.error && list.items.length === 0 ? (
        <ErrorState message={messageOf(list.error)} error={list.error} onRetry={() => void list.reload()} retryLabel={t("general_try_again", "Try Again")} />
      ) : !list.loading && list.items.length === 0 ? (
        <EmptyState title={t("chat_screen_no_messages_yet", "No Messages Yet")}
          message={t("chat_screen_empty_description", "Your chats about jobs will appear here.")} />
      ) : (
        <ul className="row-list">
          {list.items.map((chat) => {
            const partner = role === "client" ? chat.caregiver?.user : chat.client?.user;
            const unread = chat.id !== selectedId && (!chat.is_seen || chat.new_message_count > 0);
            return (
              <li key={chat.id}>
                <button type="button" className={`chat-row ${chat.id === selectedId ? "selected" : ""}`}
                  aria-current={chat.id === selectedId ? "true" : undefined}
                  onClick={() => navigate(`/chat/${chat.id}`, { replace: selectedId !== null })}>
                  <Avatar src={partner?.photo} size={60} />
                  <span className="chat-row-text">
                    <span className="chat-row-top"><b>{partner?.first_name} {partner?.last_name}</b>
                      <small>{localTime(chat.updated_at)}</small></span>
                    <span className="muted ellipsis" dir="auto">{chat.last_message}</span>
                  </span>
                  {unread && <span className="dot" aria-label="Unread" />}
                  <Icon name="ic_chevron_forward" size={22} tint="var(--text-secondary)" className="flip-rtl" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {list.loading && list.items.length > 0 && <Spinner />}
      <InfiniteSentinel active={list.hasMore && !list.loading} onVisible={list.loadMore} />
    </>
  );
}

/* ----------------------------------------------------------------- Profile */

function ProfileTab() {
  const navigate = useNavigate();
  const { user, role, signOut } = useSession();
  const { t, label } = useI18n();
  const { find } = useBaseData();
  const { act } = useFeedback();
  const [confirmLogout, setConfirmLogout] = useState(false);
  if (!user) return <Spinner />;
  const gender = find("genders", user.gender_id);

  const items: { icon: string; title: string; description: string; to?: string; action?: () => void; tone?: string }[] = [
    { icon: "ic_match_on", title: t("profile_matches_title", "Matches"), description: t("profile_matches_description", "Review your match history"), to: "/profile/matches", tone: "success" },
    { icon: "ic_support", title: t("profile_help_center_title", "Help Center"), description: t("profile_help_center_description", "Get help and support"), to: "/help" },
    { icon: "ic_issue", title: t("profile_report_an_issue_title", "Report an Issue"), description: t("profile_report_an_issue_description", ""), to: "/report-issue" },
    { icon: "ic_faq", title: t("profile_faq_title", "FAQ"), description: t("profile_faq_description", "Find answers to common questions"), to: "/faq" },
    { icon: "ic_language", title: t("profile_change_language_title", "Change Language"), description: t("profile_change_language_description", "Choose your preferred language"), to: "/change-language" },
    { icon: "ic_favorite_off", title: t("profile_favorites_title", "Favorites"),
      description: role === "client" ? t("profile_favorites_client_description", "View your saved caregivers") : t("profile_favorites_caregiver_description", "View your saved clients"), to: "/favorites" },
    { icon: "ic_lock", title: t("navigation_drawer_password_title", "Change Password"), description: t("navigation_drawer_password_description", "Update your account password"), to: "/change-password" },
    { icon: "ic_logout", title: t("profile_log_out_title", "Log Out"), description: t("profile_log_out_description", "Sign out from your account"), action: () => setConfirmLogout(true), tone: "danger" },
  ];

  return (
    <>
      <Hero image="bg_profile" icon="ic_profile_off" title={t("profile_title", "Profile")}
        subtitle={t("profile_description", "Manage your personal information and account settings.")} />
      <section className="profile-card">
        <Avatar src={user.photo} size={92} />
        <div className="profile-card-text">
          <h2>{user.first_name} {user.last_name}</h2>
          {gender && <p><Icon name={gender.icon} size={20} tint="var(--text-secondary)" />{label(gender)}</p>}
          <p><Icon name="ic_email" size={20} tint="var(--text-secondary)" />{user.email}</p>
          {user.date_of_birth && <p><Icon name="ic_calendar" size={20} tint="var(--text-secondary)" />{user.date_of_birth}</p>}
        </div>
        <button type="button" className="round-btn" onClick={() => navigate("/profile/edit")} aria-label={t("profile_edit", "Edit")}>
          <Icon name="ic_edit" size={22} tint="var(--primary-dark)" />
        </button>
      </section>
      <ul className="menu-card">
        {items.map((item) => (
          <li key={item.title}>
            <button type="button" className={`menu-row ${item.tone ?? ""}`}
              onClick={() => (item.action ? item.action() : navigate(item.to!))}>
              <span className="menu-icon"><Icon name={item.icon} size={30}
                tint={item.tone === "success" ? "var(--success)" : item.tone === "danger" ? "var(--error)" : "var(--text)"} /></span>
              <span className="menu-text"><b>{item.title}</b><small>{item.description}</small></span>
              <Icon name="ic_chevron_forward" size={20} tint="var(--text-secondary)" className="flip-rtl" />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={confirmLogout} onClose={() => setConfirmLogout(false)} labelledBy="logout-title"
        title={t("navigation_drawer_log_out_dialog_title", "Are you sure?")}>
        <p>{t("navigation_drawer_log_out_dialog_message", "You have selected to sign out from your account.")}</p>
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => setConfirmLogout(false)}>{t("navigation_drawer_log_out_dialog_deny", "Cancel")}</Button>
          <Button variant="danger" onClick={async () => {
            setConfirmLogout(false);
            await act(t("loading_auth_logout", "Signing out"), signOut);
            navigate("/intro", { replace: true });
          }}>{t("navigation_drawer_log_out_dialog_confirm", "Confirm")}</Button>
        </div>
      </Dialog>
    </>
  );
}
