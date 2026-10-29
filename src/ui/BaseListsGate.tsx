import { useEffect, useState, type ReactNode } from "react";
import { useBaseLists } from "../app/baseData";
import type { ListName } from "../app/baseDataLoader";
import { useI18n } from "../app/i18n";
import { ErrorState } from "./kit";
import { Icon } from "./Icon";

/** Shows `children` once the reference lists they read are there; until then the screen's
 *  own placeholder, and a Try Again if one of the lists could not be loaded. */
export function BaseListsGate({ names, placeholder, children }: {
  names: readonly ListName[]; placeholder: ReactNode; children: ReactNode;
}) {
  const { state, retry } = useBaseLists(names);
  const { t } = useI18n();
  if (state === "ready") return <>{children}</>;
  if (state === "failed") {
    return <ErrorState message={t("general_network_title", "Cannot communicate with server.")} onRetry={retry}
      retryLabel={t("general_try_again", "Try Again")} />;
  }
  return <>{placeholder}</>;
}

/** The app's copy and its language list are used everywhere and no screen waits for them
 *  (English shows until they arrive). If one can't be loaded, a slim line at the top of the
 *  page offers Try Again; it sits in the page flow, so it covers nothing, and can be closed. */
export function TranslationsNotice() {
  const { state, retry } = useBaseLists(["contents", "languages"]);
  const { t } = useI18n();
  const [closed, setClosed] = useState(false);
  // A new failure (after a Try Again that didn't help) shows it again.
  useEffect(() => { if (state !== "failed") setClosed(false); }, [state]);
  if (state !== "failed" || closed) return null;
  return (
    <div className="lists-notice" role="status">
      <span>{t("general_network_title", "Cannot communicate with server.")}</span>
      <button type="button" className="link" onClick={retry}>{t("general_try_again", "Try Again")}</button>
      <button type="button" className="icon-btn" aria-label={t("general_close", "Close")} onClick={() => setClosed(true)}>
        <Icon name="ic_clear" size={16} tint="var(--text-secondary)" />
      </button>
    </div>
  );
}
