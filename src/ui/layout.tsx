import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useGoBack } from "../navigation/back";
import { useSession } from "../auth/SessionContext";
import { useI18n } from "../app/i18n";
import { Avatar } from "./kit";
import { assetUrl, Icon } from "./Icon";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <img src={assetUrl("logo")} alt="" width={compact ? 48 : 40} height={compact ? 48 : 40} />
      {!compact && <b>Carezaar</b>}
    </span>
  );
}

/** Top bar of the three main tabs: logo, notifications bell, avatar → Profile. */
export function AppHeader({ unread = 0 }: { unread?: number }) {
  const navigate = useNavigate();
  const { user } = useSession();
  const { t } = useI18n();
  return (
    <header className="app-header">
      <Logo />
      <div className="app-header-actions">
        <button type="button" className="icon-btn badge-host" onClick={() => navigate("/notifications")}
          aria-label={t("general_notifications", "Notifications")}>
          <Icon name={unread > 0 ? "ic_notification_on" : "ic_notification_off"} size={26} tint="var(--text)" />
          {unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
        </button>
        <button type="button" className="icon-btn" onClick={() => navigate("/profile")}
          aria-label={t("general_profile", "Profile")}>
          <Avatar src={user?.photo} size={38} name={user?.first_name ?? undefined} />
        </button>
      </div>
    </header>
  );
}

/** Secondary screens: back button, centred title, logo mark. */
export function BackHeader({ title, onBack }: { title?: ReactNode; onBack?: () => void }) {
  const goBack = useGoBack("/");
  return (
    <header className="back-header">
      <button type="button" className="back-btn" onClick={onBack ?? (() => goBack())} aria-label="Back">
        <Icon name="ic_arrow_backward" size={22} tint="var(--text)" className="flip-rtl" />
      </button>
      <h1>{title}</h1>
      <img src={assetUrl("logo")} alt="" width={48} height={48} className="back-header-logo" />
    </header>
  );
}

/** Photo header used by Matches, Messages and Profile. */
export function Hero({ image, title, subtitle, icon }: {
  image: string; title: string; subtitle: string; icon: string;
}) {
  return (
    <section className="hero" style={{ backgroundImage: `url(${assetUrl(image)})` }}>
      <div className="hero-card">
        <h1>{title} <Icon name={icon} size={30} tint="var(--primary-dark)" /></h1>
        <p>{subtitle}</p>
      </div>
    </section>
  );
}

export function BottomNav() {
  const { t } = useI18n();
  const tabs = [
    { to: "/main/matches", label: t("bottom_navigation_matches", "Matches"), icon: "matches" },
    { to: "/main/messages", label: t("bottom_navigation_messages", "Messages"), icon: "messages" },
    { to: "/main/profile", label: t("bottom_navigation_profile", "Profile"), icon: "profile" },
  ];
  return (
    <nav className="bottom-nav" aria-label="Main">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={({ isActive }) => (isActive ? "active" : "")}>
          {({ isActive }) => (
            <>
              <Icon name={`ic_${tab.icon}_${isActive ? "on" : "off"}`} size={26}
                tint={isActive ? "var(--primary-dark)" : "var(--text-secondary)"} />
              <span>{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Scrollable page with an optional pinned footer, sized to the app column. */
export function Page({ header, footer, children, className }: {
  header?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div className={`page ${className ?? ""}`}>
      {header}
      <main className="page-body">{children}</main>
      {footer && <div className="page-footer">{footer}</div>}
    </div>
  );
}
