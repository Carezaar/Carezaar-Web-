import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { userService } from "../api/services";
import { tokenStore } from "../api/session";
import { useSession } from "../auth/SessionContext";
import { useI18n } from "./i18n";

/** Android polls `users/notifications/count?checked_at=` every 30 s while running.
 *  When the count rises it posts a system notification ("New Notification(s)" /
 *  "You have N new notification(s).") that opens Notifications, and the bell turns
 *  red while the count is above zero. This is the web equivalent: same poll, same stored count, and
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
  const userID = user?.id;
  const sessionOwner = tokenStore.owner;
  const previousUser = useRef(userID);
  const checkedRevision = useRef(0);
  const tRef = useRef(t);
  tRef.current = t;
  // useNavigate changes with every route change; reading it through a ref keeps the poll
  // from restarting (an extra request and a reset timer) on each navigation.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (previousUser.current !== userID) {
      previousUser.current = userID;
      setUnread(0);
    }
    if (!userID) { setUnread(0); return; }
    const owner = sessionOwner ?? tokenStore.captureOwner();
    let active = true;
    const poll = async () => {
      const revision = checkedRevision.current;
      try {
        const count = await userService.notificationCount(read(CHECKED_AT));
        // A completed request belongs to this session and its original seen state.
        if (!active || !tokenStore.owns(owner) || revision !== checkedRevision.current) return;
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
            note.onclick = () => {
              if (tokenStore.owns(owner)) { window.focus(); navigateRef.current("/notifications"); }
              note.close();
            };
          }
        } else if (count < previous) {
          write(LAST_COUNT, count);
        }
      } catch { /* offline or signed out: keep the last count */ }
    };
    // Signing out or changing users invalidates pending responses and the timer.
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [userID, sessionOwner]);

  const markChecked = useCallback(() => {
    checkedRevision.current++;
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
