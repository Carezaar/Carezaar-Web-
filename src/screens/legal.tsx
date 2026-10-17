import { useState, type ReactNode } from "react";
import { LEGAL_DOCUMENT_URLS } from "../api/config";
import { useI18n } from "../app/i18n";
import { Button, Dialog } from "../ui/kit";

export type LegalDocument = "terms" | "privacy";

/** "I agree to the {TERMS_OF_USE} and acknowledge that I have read the {PRIVACY_POLICY}."
 *  from the managed texts, with each document's name as an underlined link that opens it
 *  inside the app (Create Account, as on Android). */
export function ConsentText({ onOpen }: { onOpen: (doc: LegalDocument) => void }) {
  const { t } = useI18n();
  const link = (doc: LegalDocument, slug: string, fallback: string) => (
    <button type="button" className="link legal-link"
      // Inside the checkbox's label: opening a document must not tick the box.
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(doc); }}>
      {t(slug, fallback)}
    </button>
  );
  const sentence = t("signup_credentials_consent", "I agree to the {TERMS_OF_USE} and acknowledge that I have read the {PRIVACY_POLICY}.");
  const parts: ReactNode[] = [];
  sentence.split(/(\{TERMS_OF_USE\}|\{PRIVACY_POLICY\})/).forEach((part, i) => {
    if (part === "{TERMS_OF_USE}") parts.push(<span key={i}>{link("terms", "signup_credentials_terms_of_use", "Terms of Use")}</span>);
    else if (part === "{PRIVACY_POLICY}") parts.push(<span key={i}>{link("privacy", "signup_credentials_privacy_policy", "Privacy Policy")}</span>);
    else if (part) parts.push(<span key={i}>{part}</span>);
  });
  return <span className="consent-text">{parts}</span>;
}

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5];

/** The Terms of Use or the Privacy Policy, scrollable and zoomable, inside the app. */
export function LegalDocumentDialog({ doc, onClose }: { doc: LegalDocument | null; onClose: () => void }) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(0);
  const url = doc ? LEGAL_DOCUMENT_URLS[doc] : "";
  const title = doc === "privacy"
    ? t("signup_credentials_privacy_policy", "Privacy Policy")
    : t("signup_credentials_terms_of_use", "Terms of Use");
  const close = () => { setZoom(0); onClose(); };
  const scale = ZOOM_STEPS[zoom];
  return (
    <Dialog open={doc !== null} onClose={close} title={title} labelledBy="legal-document">
      {url ? (
        <>
          <div className="legal-zoom" role="group" aria-label={title}>
            <button type="button" className="icon-btn" onClick={() => setZoom((z) => Math.max(0, z - 1))}
              disabled={zoom === 0} aria-label="Zoom out">−</button>
            <span aria-live="polite">{Math.round(scale * 100)}%</span>
            <button type="button" className="icon-btn" onClick={() => setZoom((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}
              disabled={zoom === ZOOM_STEPS.length - 1} aria-label="Zoom in">+</button>
          </div>
          <div className="legal-document">
            <iframe title={title} src={url}
              style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "0 0" }} />
          </div>
        </>
      ) : (
        <p className="legal-missing" role="status">{t("general_error_not_found", "This item is no longer available.")}</p>
      )}
      <Button variant="outline" onClick={close}>{t("general_ok", "OK")}</Button>
    </Dialog>
  );
}
