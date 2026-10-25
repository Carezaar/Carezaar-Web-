import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/errors";
import { caregiverService, clientService, userService } from "../api/services";
import type { CaregiverBrief, ClientBrief, MatchSort, PartnerUser } from "../api/types";
import { formatDistance } from "../api/match";
import { useSession } from "../auth/SessionContext";
import { useBaseData } from "../app/baseData";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { personName } from "../app/names";
import { usePaged } from "../app/usePaged";
import { matchesKey, readBanner, readSnapshot, rememberedSort, rememberSort, saveScroll, sharedRefresh, writeBanner, writeSnapshot } from "../app/matchesState";
import { tokenStore } from "../api/session";
import { AppHeader, BottomNav, Hero } from "../ui/layout";
import { Avatar, Button, cardLink, Dialog, EmptyState, ErrorState, InfiniteSentinel, InlineProgress, PhotoBox, SkeletonDetail, SkeletonList } from "../ui/kit";
import { DuplicateActionError, guarded, isGuarded, useGuarded } from "../app/actionGuard";
import { Icon } from "../ui/Icon";
import { useIsDesktop } from "../ui/frames";
import { useNotifications } from "../app/notifications";
import { usePullToRefresh } from "../ui/usePullToRefresh";

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
  clienttypeId?: number; isMatch: boolean };

/** The heart on a match card. It already shows the new state while the change is saved,
 *  and is disabled (busy) until the server has answered (shared guard `bookmark:<id>`). */
function CardHeart({ userId, on, label, onToggle }: { userId: string; on: boolean; label: string; onToggle: () => void }) {
  const busy = useGuarded(`bookmark:${userId}`);
  return (
    <button type="button" className="icon-btn card-heart" aria-pressed={on} aria-label={label} disabled={busy} aria-busy={busy}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      onKeyDown={(e) => e.stopPropagation()}>
      <Icon name={on ? "ic_favorite_on" : "ic_favorite_off"} size={26} tint={on ? "var(--error)" : "var(--primary-dark)"} />
    </button>
  );
}

/** How long each of a caregiver's care types stays in the banner. */
const BANNER_ROTATE_MS = 5_000;

function MatchesTab() {
  const navigate = useNavigate();
  const { role, user } = useSession();
  const { t, label } = useI18n();
  const { find } = useBaseData();
  const { toast, messageOf } = useFeedback();
  // The sort and the loaded list belong to this sign-in (client request, 23 Oct 2026): the
  // sort is remembered until sign-out, and coming back to the tab shows the list as it was
  // left (every loaded page, same place) while it is refreshed quietly. See matchesState.
  const [key] = useState(() => matchesKey(tokenStore.owner, user?.id, role));
  const [sort, setSortState] = useState<MatchSort>(() => rememberedSort(key) ?? "distance");
  const setSort = (next: MatchSort) => { setSortState(next); rememberSort(key, next); };
  const [returning] = useState(() => readSnapshot<Card>(key, sort));
  const [sortOpen, setSortOpen] = useState(false);
  const [headerTypeIds, setHeaderTypeIds] = useState<number[]>(() => readBanner(key) ?? []);
  const [bannerIndex, setBannerIndex] = useState(0);
  const isClient = role === "client";

  // One page of cards in a given sort (also used by the quiet refresh on return).
  const fetchCards = (by: MatchSort, page: number): Promise<{ result: Card[]; meta: import("../api/types").ApiMeta | null }> => isClient
    ? clientService.matches(by, page).then(({ result, meta }) => ({
        meta, result: result.map((c: CaregiverBrief) => ({ id: c.id, user: c.user, min: c.salary_min, max: c.salary_max, distance: c.distance, isMatch: c.is_match === true })) }))
    : caregiverService.matches(by, page).then(({ result, meta }) => ({
        meta, result: result.map((c: ClientBrief) => ({ id: c.id, user: c.user, min: c.salary_min, max: c.salary_max, distance: c.distance, clienttypeId: c.clienttype_id, isMatch: c.is_match === true })) }));
  const fetchRef = useRef(fetchCards);
  fetchRef.current = fetchCards;

  // My Matches loads only once the saved sign-in has been checked, as on Android
  // (parity review v6.0, Q1): this list mounts after the session is accepted. The first page
  // shows skeleton cards; further pages a small indicator under the list.
  const list = usePaged<Card>((page) => fetchCards(sort, page), [sort, isClient], undefined, returning);

  // Keep what is on screen for the next return.
  useEffect(() => {
    if (key && list.page > 0) writeSnapshot<Card>({ key, sort, items: list.items, page: list.page, ended: list.ended, total: list.total, scroll: window.scrollY });
  }, [key, sort, list.items, list.page, list.ended, list.total]);
  // A layout effect: its clean-up runs while the next screen is put in place, so scrolling the
  // browser does as the page changes is not recorded as the person's position.
  useLayoutEffect(() => {
    const onScroll = () => { if (window.location.pathname === "/main/matches") saveScroll(key, window.scrollY); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [key]);
  // Back on the tab: the same place in the list, then every loaded page refreshed quietly
  // (no loading window, no return to page 1). One refresh is shared by quick returns.
  const quietPage = useRef(list.refreshLoaded);
  quietPage.current = list.refreshLoaded;
  useLayoutEffect(() => {
    if (returning) window.scrollTo({ top: returning.scroll, behavior: "instant" });
  }, [returning]);
  useEffect(() => {
    if (!returning) return;
    const pages = returning.page;
    void quietPage.current(() => sharedRefresh(`${key}|${returning.sort}|${pages}`, () => Promise.all(
      Array.from({ length: pages }, (_, i) => fetchRef.current(returning.sort, i + 1)))));
  }, [returning, key]);

  // The banner follows the care type: header_senior, header_child, … A caregiver who
  // supports several client types sees each in turn, from their saved skills.
  useEffect(() => {
    let current = true;
    // Kept from the last visit (if any) until the profile answers, so the banner keeps its size.
    setHeaderTypeIds(readBanner(key) ?? []);
    setBannerIndex(0);
    const load = isClient
      ? clientService.profile().then((p) => (p.clienttype_id ? [p.clienttype_id] : []))
      : caregiverService.profile().then((p) => p.clienttype_ids);
    load.then((ids) => {
      const unchanged = JSON.stringify(ids) === JSON.stringify(readBanner(key));
      writeBanner(key, ids);
      if (current && !unchanged) setHeaderTypeIds(ids);
    }).catch(() => undefined);
    return () => { current = false; };
  }, [isClient, key]);
  const bannerTypes = headerTypeIds.filter((id) => find("clienttypes", id)?.icon);
  const rotating = bannerTypes.length > 1;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => setBannerIndex((i) => i + 1), BANNER_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [rotating]);
  const headerIcon = bannerTypes.length ? find("clienttypes", bannerTypes[bannerIndex % bannerTypes.length])?.icon : undefined;
  const headerType = headerIcon ? headerIcon.replace("client_", "header_") : null;

  const ptr = usePullToRefresh(async () => {
    try { await list.refresh(); } catch (e) { toast(messageOf(e)); }
  });

  // Favourites straight from the card. One request per person at a time; the heart
  // shows the server's answer (put back if the request fails).
  // One favourite change per person at a time, shared with every screen (actionGuard).
  const toggleFavorite = async (card: Card) => {
    const resource = `bookmark:${card.user.id}`;
    if (isGuarded(resource)) return;
    const on = card.user.is_favorite;
    const setFavorite = (value: boolean) => list.mutate((all) => all.map((c) => (c.id === card.id ? { ...c, user: { ...c.user, is_favorite: value } } : c)));
    setFavorite(!on);
    try {
      await guarded(resource, () => on ? userService.removeBookmark(card.user.id) : userService.addBookmark(card.user.id));
    } catch (e) {
      if (e instanceof DuplicateActionError) return;
      // No answer: the change may have gone through. It isn't sent again; the person's
      // profile is read to show what the server has.
      if (e instanceof ApiError && (e.kind === "network" || e.kind === "timeout")) {
        try {
          const p = isClient ? await clientService.caregiver(card.id) : await caregiverService.client(card.id);
          setFavorite(p.user.is_favorite);
          if (p.user.is_favorite !== on) return;
        } catch { setFavorite(on); }
      } else setFavorite(on);
      toast(messageOf(e));
    }
  };

  const prefix = isClient ? "client" : "caregiver";
  return (
    <>
      <div className={`ptr ${ptr.refreshing || list.refreshing ? "on" : ""}`} style={{ height: ptr.refreshing || list.refreshing ? 48 : ptr.pull }}
        aria-hidden={!(ptr.refreshing || list.refreshing)}>
        {(ptr.pull > 0 || ptr.refreshing || list.refreshing) && (
          <span className={`ptr-icon ${ptr.armed ? "armed" : ""} ${ptr.refreshing || list.refreshing ? "spin" : ""}`} role="status"
            aria-label={ptr.refreshing || list.refreshing ? t("general_loading", "Loading...") : undefined}>
            <Icon name="ic_refresh" size={22} tint="var(--primary)" />
          </span>
        )}
      </div>
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
      ) : list.items.length === 0 && (list.loading || list.page === 0) ? (
        <SkeletonList count={4} label={t("loading_matches", "Getting list of matches")} />
      ) : list.items.length === 0 ? (
        <EmptyState title={`${t(`${prefix}_matches_all_matches`, "All Matches")} (0)`} illustration="illus_chat" />
      ) : (
        <ul className="card-list">
          {list.items.map((c) => (
            <li key={c.id}>
              <div className="match-card" {...cardLink(() => navigate(isClient ? `/caregivers/${c.id}` : `/clients/${c.id}`), personName(c.user, t))}>
                <PhotoBox className="match-photo" src={c.user.photo} />
                <div className="match-body">
                  <div className="match-title">
                    <h2>{personName(c.user, t)}</h2>
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
                  {/* Only for a current match (the server's is_match), not for requests. */}
                  {c.isMatch && <Icon name="ic_match_on" size={26} tint="var(--success)" label={t("general_match", "Match")} />}
                  <CardHeart userId={c.user.id} on={c.user.is_favorite}
                    label={`${c.user.is_favorite ? "Remove from favorites" : "Add to favorites"}: ${personName(c.user, t)}`}
                    onToggle={() => void toggleFavorite(c)} />
                  <Icon name="ic_chevron_forward" size={20} tint="var(--text-secondary)" className="flip-rtl" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.loading && list.items.length > 0 && <InlineProgress />}
      <InfiniteSentinel active={list.hasMore && !list.loading && !list.revalidating && !list.error} onVisible={list.loadMore} resetKey={list.page} />
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
    <Hero image="header_messages" icon="ic_messages_off" title={t("messages_title", "Messages")}
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

const CHAT_LIST_POLL_MS = 10_000;

function ChatList({ selectedId }: { selectedId: number | null }) {
  const navigate = useNavigate();
  const { role } = useSession();
  const { t } = useI18n();
  const { messageOf } = useFeedback();
  const list = usePaged((page) => userService.chats(page), []);
  const { reload, refresh } = list;
  useEffect(() => {
    const onChange = () => void reload();
    window.addEventListener(CHATS_CHANGED, onChange);
    return () => window.removeEventListener(CHATS_CHANGED, onChange);
  }, [reload]);
  // The list updates itself every 10 seconds while it is open, as on Android (parity
  // review v4.0, K1): quietly, keeping what is shown if a check fails.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh({ keepMore: true }).catch(() => undefined);
    }, CHAT_LIST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return (
    <>
      {list.error && list.items.length === 0 ? (
        <ErrorState message={messageOf(list.error)} error={list.error} onRetry={() => void list.reload()} retryLabel={t("general_try_again", "Try Again")} />
      ) : list.items.length === 0 && (list.loading || list.page === 0) ? (
        <SkeletonList count={5} variant="row" label={t("loading_chat_get_all", "Getting list of chats")} />
      ) : list.items.length === 0 ? (
        <EmptyState title={t("chat_screen_no_messages_yet", "No Messages Yet")}
          message={t("chat_screen_empty_description", "Your chats about jobs will appear here.")} />
      ) : (
        <ul className="row-list">
          {list.items.map((chat) => {
            const partner = role === "client" ? chat.caregiver?.user : chat.client?.user;
            // Only new messages make a conversation unread; one never opened isn't.
            const unread = chat.id !== selectedId && chat.new_message_count > 0;
            return (
              <li key={chat.id}>
                <button type="button" className={`chat-row ${chat.id === selectedId ? "selected" : ""}`}
                  aria-current={chat.id === selectedId ? "true" : undefined}
                  onClick={() => navigate(`/chat/${chat.id}`, { replace: selectedId !== null })}>
                  <Avatar src={partner?.photo} size={60} />
                  <span className="chat-row-text">
                    <span className="chat-row-top"><b>{personName(partner, t)}</b>
                      <small>{chat.updated_at}</small></span>
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
      {list.loading && list.items.length > 0 && <InlineProgress />}
      <InfiniteSentinel active={list.hasMore && !list.loading && !list.error} onVisible={list.loadMore} resetKey={list.page} />
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
  const signingOut = useGuarded("auth:logout");
  if (!user) return <SkeletonDetail />;
  const gender = find("genders", user.gender_id);

  const items: { icon: string; title: string; description: string; to?: string; action?: () => void; tone?: string }[] = [
    { icon: "ic_match_on", title: t("profile_matches_title", "Matches"), description: t("profile_matches_description", "Review your match history"), to: "/profile/matches", tone: "success" },
    { icon: "ic_support", title: t("profile_help_center_title", "Help Center"), description: t("profile_help_center_description", "Get help and support"), to: "/help" },
    { icon: "ic_issue", title: t("profile_report_an_issue_title", "Report an Issue"), description: t("profile_report_an_issue_description", ""), to: "/report-issue" },
    { icon: "ic_faq", title: t("profile_faq_title", "FAQ"), description: t("profile_faq_description", "Find answers to common questions"), to: "/faq" },
    { icon: "ic_language", title: t("profile_change_language_title", "Change Language"), description: t("profile_change_language_description", "Choose your preferred language"), to: "/change-language" },
    { icon: "ic_favorite_off", title: t("profile_favorites_title", "Favorites"),
      description: role === "client" ? t("profile_favorites_client_description", "View your saved caregivers") : t("profile_favorites_caregiver_description", "View your saved clients"), to: "/favorites" },
    { icon: "ic_lock", title: t("profile_password_change_title", "Change Password"), description: t("profile_password_change_description", "Change your current password"), to: "/change-password" },
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
          <Button variant="danger" loading={signingOut} onClick={async () => {
            try { await act("auth:logout", signOut); } catch { return; }
            setConfirmLogout(false);
            navigate("/intro", { replace: true });
          }}>{t("navigation_drawer_log_out_dialog_confirm", "Confirm")}</Button>
        </div>
      </Dialog>
    </>
  );
}
