import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useSession } from "../auth/SessionContext";
import { useI18n } from "../app/i18n";
import { useFeedback } from "../app/feedback";
import { useNotifications } from "../app/notifications";
import { Avatar, Button, Dialog } from "./kit";
import { assetUrl, Icon } from "./Icon";

/** Desktop and laptop get the layout from the Figma "Brainstorming · Desktop" frames;
 *  anything narrower keeps the mobile app exactly as designed. */
const DESKTOP_QUERY = "(min-width: 1024px)";
/** From tablet width up, signed-out screens are web forms rather than the phone frames. */
const WIDE_QUERY = "(min-width: 768px)";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);
export const useIsWide = () => useMediaQuery(WIDE_QUERY);

/** Signed-in frame: sidebar navigation + top bar (desktop frames 766:12, 766:18) from
 *  tablet width up. The element tree is the same at every width, and CSS hides the
 *  sidebar on phones, so crossing the breakpoint (a phone turned sideways) keeps the
 *  screen mounted: a half-typed message or form survives. */
export function AppFrame({ children }: { children: ReactNode }) {
  return <DesktopShell>{children}</DesktopShell>;
}

function DesktopShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user, signOut } = useSession();
  const { t } = useI18n();
  const { act } = useFeedback();
  const { unread } = useNotifications();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const nav = [
    { to: "/main/matches", icon: "ic_matches", label: t("bottom_navigation_matches", "Matches"), toggles: true },
    { to: "/main/messages", icon: "ic_messages", label: t("bottom_navigation_messages", "Messages"), toggles: true, also: "/chat/" },
    { to: "/main/profile", icon: "ic_profile", label: t("bottom_navigation_profile", "Profile"), toggles: true },
    { to: "/help", icon: "ic_support", label: t("profile_help_center_title", "Help Center") },
    { to: "/report-issue", icon: "ic_issue", label: t("profile_report_an_issue_title", "Report an Issue") },
    { to: "/faq", icon: "ic_faq", label: t("profile_faq_title", "FAQ") },
    { to: "/change-language", icon: "ic_language", label: t("profile_change_language_title", "Change Language") },
    { to: "/favorites", icon: "ic_favorite", label: t("profile_favorites_title", "Favorites"), toggles: true },
  ];
  return (
    <div className="desk-shell">
      <aside className="desk-sidebar" aria-label="Main">
        <NavLink to="/main/matches" className="desk-brand" aria-label="Carezaar">
          <img src={assetUrl("logo")} alt="" width={44} height={44} /><b>Carezaar</b>
        </NavLink>
        <nav>
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => (isActive || (item.also && window.location.pathname.startsWith(item.also)) ? "active" : "")}>
              {({ isActive }) => {
                const on = isActive || Boolean(item.also && window.location.pathname.startsWith(item.also));
                return (
                  <>
                    <Icon name={item.toggles ? `${item.icon}_${on ? "on" : "off"}` : item.icon} size={24}
                      tint={on ? "var(--primary)" : "var(--text)"} />
                    <span>{item.label}</span>
                  </>
                );
              }}
            </NavLink>
          ))}
          <button type="button" className="danger" onClick={() => setConfirmLogout(true)}>
            <Icon name="ic_logout" size={24} tint="var(--error)" />
            <span>{t("profile_log_out_title", "Log Out")}</span>
          </button>
        </nav>
        <figure className="desk-art">
          <img src="/assets/desktop-people-care-art.jpg" alt="" loading="lazy" />
        </figure>
      </aside>
      <div className="desk-main">
        <header className="desk-topbar">
          <button type="button" className="icon-btn badge-host" onClick={() => navigate("/notifications")}
            aria-label={t("general_notifications", "Notifications")}>
            <Icon name={unread > 0 ? "ic_notification_on" : "ic_notification_off"} size={26} tint="var(--text)" />
            {unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
          </button>
          <button type="button" className="desk-user" onClick={() => navigate("/main/profile")}>
            <Avatar src={user?.photo} size={44} name={user?.first_name ?? undefined} />
            <span>{user?.first_name ? `${user.first_name} ${user.last_name ?? ""}`.trim() : t("general_profile", "Profile")}</span>
            <Icon name="ic_chevron_down" size={18} tint="var(--text-secondary)" />
          </button>
        </header>
        <div className="desk-content">{children}</div>
      </div>
      <Dialog open={confirmLogout} onClose={() => setConfirmLogout(false)} labelledBy="desk-logout"
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
    </div>
  );
}

/** Signed-out frame (desktop frames 767:30–767:39). On desktop: brand and care
 *  photograph on one side, the screen in a card on the other. On tablets the card is
 *  centred under the brand. On phones only the screen shows, full width. As with
 *  AppFrame, the tree does not change with the width, so typed input survives a resize. */
export function AuthFrame({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="auth-layout">
      <section className="auth-art" aria-hidden="true">
        <div className="auth-brand">
          <img src={assetUrl("logo")} alt="" width={72} height={72} />
          <div><b>Carezaar</b><span>{t("splash_slogan", "Care, Connect, Compassion")}</span></div>
        </div>
        <img className="auth-photo" src="/assets/desktop-signin-photo.jpg" alt="" loading="lazy" width={695} height={638} />
      </section>
      <section className="auth-card">{children}</section>
    </div>
  );
}
