import { useEffect, useState, type ReactNode } from "react";
import { CONNECTION_PROBLEM_EVENT, retryRenewal } from "../api/client";
import { useI18n } from "./i18n";
import { Button } from "../ui/kit";
import { Icon } from "../ui/Icon";

/** The app-level "Connection Problem" window, as on Android: when the sign-in has to be
 *  renewed and the server can't be reached, one window covers the app (however many
 *  requests were waiting) until Retry renews it. It can't be dismissed: nothing that
 *  needs the session can work until then. */
export function ConnectionProblem({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [stillFailing, setStillFailing] = useState(false);

  useEffect(() => {
    const onChange = (e: Event) => {
      const on = Boolean((e as CustomEvent<boolean>).detail);
      setOpen(on);
      if (!on) { setRetrying(false); setStillFailing(false); }
    };
    window.addEventListener(CONNECTION_PROBLEM_EVENT, onChange);
    return () => window.removeEventListener(CONNECTION_PROBLEM_EVENT, onChange);
  }, []);

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    setStillFailing(false);
    const done = await retryRenewal().catch(() => false);
    if (!done) { setRetrying(false); setStillFailing(true); }
  };

  return (
    <>
      <div inert={open} aria-hidden={open || undefined} style={{ display: "contents" }}>{children}</div>
      {open && (
        <div className="permission-gate" role="alertdialog" aria-modal="true" aria-labelledby="renewal-title" aria-describedby="renewal-text">
          <div className="permission-card">
            <span className="permission-icon"><Icon name="ic_no_network" size={40} tint="var(--error)" /></span>
            <h1 id="renewal-title">{t("general_session_renewal_title", "Connection Problem")}</h1>
            <p id="renewal-text">{t("general_session_renewal_message", "We could not reach the server to renew your sign-in. Please check your internet connection and try again.")}</p>
            {stillFailing && <p className="field-message" role="alert">{t("general_network_title", "Cannot communicate with server.")}</p>}
            <Button autoFocus loading={retrying} disabled={retrying} onClick={() => void retry()}>
              {t("general_retry", "Retry")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
