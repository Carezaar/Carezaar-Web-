import { useEffect, type ReactNode } from "react";

/** Notification permission is asked for as the app opens and the app carries on
 *  whatever the answer, as on Android (parity review v4.0, A1). Browsers only show the
 *  permission prompt from a user action, so the web asks on the visitor's first click
 *  anywhere (an accepted platform difference), and that click still does what it was
 *  for. Refusing, dismissing the prompt, or a browser without notification support
 *  changes nothing else: the site stays fully usable. */
function ask() {
  try {
    if (!("Notification" in window) || Notification.permission !== "default") return;
    // Older Safari only supports the callback form; the answer itself is not needed.
    const maybe = Notification.requestPermission(() => undefined);
    if (maybe && typeof maybe.catch === "function") maybe.catch(() => undefined);
  } catch {
    /* no notification support: nothing to ask */
  }
}

export function NotificationGate({ children }: { children: ReactNode }) {
  // First click anywhere: ask once. Capture phase, so the click itself still goes on to
  // whatever was clicked.
  useEffect(() => {
    window.addEventListener("click", ask, { capture: true, once: true });
    return () => window.removeEventListener("click", ask, { capture: true });
  }, []);
  return <>{children}</>;
}
