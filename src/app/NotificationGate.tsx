import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n";
import { Button } from "../ui/kit";
import { Icon } from "../ui/Icon";

/** Notification permission is mandatory, as on Android (client requirement, October
 *  2026). Browsers only show the permission prompt from a user action, so the app asks
 *  on the visitor's first click anywhere, and that click still does what it was for.
 *
 *  - granted: nothing more happens;
 *  - refused, or the prompt dismissed: the app is covered by an explanation until
 *    notifications are allowed. A dismissed prompt can be shown again from its button;
 *    a refusal can only be undone in the browser's site settings, so the screen says
 *    how, and continues by itself once the browser reports the change;
 *  - no notification support at all (e.g. Safari on an iPhone outside a Home Screen
 *    app): the browser can't grant it, so the app is not blocked. */
type Permission = NotificationPermission | "unsupported";

function current(): Permission {
  try {
    return "Notification" in window ? Notification.permission : "unsupported";
  } catch {
    return "unsupported";
  }
}

async function ask(): Promise<Permission> {
  try {
    // Older Safari only supports the callback form.
    return await new Promise<NotificationPermission>((resolve) => {
      const maybe = Notification.requestPermission(resolve);
      if (maybe && typeof maybe.then === "function") void maybe.then(resolve);
    });
  } catch {
    return current();
  }
}

export function NotificationGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [permission, setPermission] = useState<Permission>(current);
  // Whether the visitor has been asked in this visit: a prompt that was dismissed
  // leaves the permission at "default", which then means "not allowed yet".
  const [asked, setAsked] = useState(false);
  const asking = useRef(false);

  const request = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    const result = await ask();
    asking.current = false;
    setAsked(true);
    setPermission(result);
  }, []);

  // First click anywhere: ask once. Capture phase, so the click itself still goes on to
  // whatever was clicked.
  useEffect(() => {
    if (permission !== "default" || asked) return;
    const onFirstClick = () => { void request(); };
    window.addEventListener("click", onFirstClick, { capture: true, once: true });
    return () => window.removeEventListener("click", onFirstClick, { capture: true });
  }, [permission, asked, request]);

  // A change made in the browser's settings (or another tab) lets the visitor continue
  // without reloading.
  useEffect(() => {
    if (permission === "granted" || permission === "unsupported") return;
    let status: PermissionStatus | null = null;
    const update = () => setPermission(current());
    navigator.permissions?.query({ name: "notifications" as PermissionName })
      .then((s) => { status = s; s.addEventListener("change", update); })
      .catch(() => undefined);
    window.addEventListener("focus", update);
    return () => { status?.removeEventListener("change", update); window.removeEventListener("focus", update); };
  }, [permission]);

  const blocked = permission === "denied" || (permission === "default" && asked);
  return (
    <>
      <div inert={blocked} aria-hidden={blocked || undefined} style={{ display: "contents" }}>{children}</div>
      {blocked && (
        <div className="permission-gate" role="alertdialog" aria-modal="true" aria-labelledby="permission-title" aria-describedby="permission-text">
          <div className="permission-card">
            <span className="permission-icon"><Icon name="ic_notification_on" size={40} tint="var(--primary-dark)" /></span>
            <h1 id="permission-title">{t("notification_permission_title", "Allow notifications")}</h1>
            <p id="permission-text">{t("notification_permission_message",
              "Carezaar needs to send you notifications about match requests, matches and messages. Please allow notifications to continue.")}</p>
            {permission === "denied" ? (
              <>
                <p className="muted small">{t("notification_permission_settings",
                  "Notifications are blocked for this site. Open the site settings (the icon next to the address bar), set Notifications to Allow, then continue.")}</p>
                <Button onClick={() => setPermission(current())}>{t("general_continue", "Continue")}</Button>
              </>
            ) : (
              <Button onClick={() => void request()}>{t("notification_permission_allow", "Allow notifications")}</Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
