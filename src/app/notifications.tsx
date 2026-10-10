import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { userService } from "../api/services";
import { useSession } from "../auth/SessionContext";
import { useI18n } from "./i18n";

/** Android polls `users/notifications/count?checked_at=` every 30 s while running.
 *  When the count rises it posts a system notification ("New Notification(s)" /
 *  "You have N new notification(s).") that opens Notifications, and the bell badge
 *  follows the count. This is the web equivalent: same poll, same stored count, and
 *  a browser notification when the tab is not in front. */
const CHECKED_AT = "carezaar.notificationsCheckedAt";
const LAST_COUNT = "carezaar.notificationCount";
const POLL_MS = 30_000;

const read = (key: string) => { try { return Number(window.localStorage.getItem(key)) || 0; } catch { return 0; } };
const write = (key: string, value: number) => { try { window.localStorage.setItem(key, String(value)); } catch { /* no storage */ } };

interface NotificationsValue {
  unread: number;
  /** Opening Notifications: everything up to now counts as seen (Android resets the
   *  check time and the stored count to 0). */
  markChecked: () => void;
}

const NotificationsContext = createContext<NotificationsValue>({ unread: 0, markChecked: () => undefined });

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const signedIn = Boolean(user);
  const tRef = useRef(t);
  tRef.current = t;

  const poll = useCallback(async () => {
    try {
      const count = await userService.notificationCount(read(CHECKED_AT));
      setUnread(count);
      const previous = read(LAST_COUNT);
      if (count > previous) {
        write(LAST_COUNT, count);
        const inBackground = document.visibilityState !== "visible" || !document.hasFocus();
        if (inBackground && "Notification" in window && Notification.permission === "granted") {
          const note = new Notification(tRef.current("general_notification_title", "New Notification(s)"), {
            body: tRef.current("general_notification_message", "You have ??? new notification(s).").replace("???", String(count - previous)),
            icon: "/icon-192.png",
            tag: "carezaar-notifications",
          });
          note.onclick = () => { window.focus(); navigate("/notifications"); note.close(); };
        }
      } else if (count < previous) {
        write(LAST_COUNT, count);
      }
    } catch { /* offline or signed out: keep the last badge */ }
  }, [navigate]);

  useEffect(() => {
    if (!signedIn) { setUnread(0); return; }
    // On the 30-second timer only (no extra check when the window comes back into view).
    // Signing out clears the timer, so nothing polls without a session.
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [signedIn, poll]);

  const markChecked = useCallback(() => {
    write(CHECKED_AT, Math.floor(Date.now() / 1000));
    write(LAST_COUNT, 0);
    setUnread(0);
  }, []);

  const value = useMemo(() => ({ unread, markChecked }), [unread, markChecked]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
