import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { API_BASE_URL, LEGAL_DOCUMENTS } from "../api/config";
import { openPDF, type PDFPages } from "../api/legalPDF";
import { fetchLegalDocument, legalFetchTarget, legalHTTPSURL, type LegalContent, type LegalRun } from "../api/legalDocuments";
import { useI18n } from "../app/i18n";
import { Button, Dialog, Spinner } from "../ui/kit";

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

/** Remote HTML is converted to inert text blocks; scripts, styles and embeds never run. */
function htmlContent(html: string): LegalContent {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script,style,noscript,iframe,object,embed,template,svg").forEach((node) => node.remove());
  const blocks: LegalContent["blocks"] = [];
  const visit = (node: Node) => {
    if (node instanceof Element && /^(H[1-6]|P|LI|TD|TH|PRE|BLOCKQUOTE)$/.test(node.tagName)) {
      const text = node.textContent?.trim();
      if (text) blocks.push({ t: /^H/.test(node.tagName) ? "h" : node.tagName === "LI" ? "li" : "p", r: [[text, false]] });
    } else if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.trim()) blocks.push({ t: "p", r: [[node.textContent.trim(), false]] });
    } else node.childNodes.forEach(visit);
  };
  visit(document.body);
  if (!blocks.length) throw new Error("Document has no readable content.");
  return { title: document.title, blocks };
}


const runs = (r: LegalRun[]) => r.map(([text, bold], i) => (bold ? <strong key={i}>{text}</strong> : <span key={i}>{text}</span>));

type Body = { kind: "pdf"; pdf: PDFPages } | { kind: "text"; content: LegalContent };

/** One published page, drawn when it comes near the visible part of the document. */
function PDFPage({ pdf, index, cssWidth, root, onError }: {
  pdf: PDFPages; index: number; cssWidth: number; root: RefObject<HTMLDivElement | null>; onError: () => void;
}) {
  const holder = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [drawn, setDrawn] = useState(0);
  const [text, setText] = useState("");
  const size = pdf.sizes[index];
  useEffect(() => {
    if (!holder.current || !cssWidth) return;
    // Before the pages have their size every one of them would count as visible.
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting && entry.boundingClientRect.height > 0),
      { root: root.current, rootMargin: "800px 0px" });
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, [root, cssWidth]);
  useEffect(() => {
    if (!near || !cssWidth || !canvas.current || drawn === cssWidth) return;
    const controller = new AbortController();
    pdf.render(index, canvas.current, cssWidth, controller.signal)
      .then(() => { if (!controller.signal.aborted) setDrawn(cssWidth); })
      .catch(() => { if (!controller.signal.aborted) onError(); });
    return () => controller.abort();
  }, [pdf, index, cssWidth, near, drawn, onError]);
  useEffect(() => {
    if (!near || text) return;
    let current = true;
    pdf.text(index).then((value) => { if (current) setText(value); }).catch(() => undefined);
    return () => { current = false; };
  }, [pdf, index, near, text]);
  return (
    <section ref={holder} className="legal-page" data-page={index + 1} data-drawn={drawn === cssWidth || undefined} aria-label={`${index + 1} / ${pdf.sizes.length}`}
      style={{ width: cssWidth, height: Math.round((cssWidth * size.height) / size.width) }}>
      <canvas ref={canvas} aria-hidden="true" />
      {text && <div className="sr-only">{text}</div>}
    </section>
  );
}

/** The Terms of Use or the Privacy Policy inside the app: the published PDF's own pages (layout,
 *  headings, bold, page breaks), scrollable and zoomable, as on Android. */
export function LegalDocumentDialog({ doc, onClose }: { doc: LegalDocument | null; onClose: () => void }) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(0);
  const [body, setBody] = useState<Body | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const source = doc ? LEGAL_DOCUMENTS[doc] : null;
  const title = doc === "privacy"
    ? t("signup_credentials_privacy_policy", "Privacy Policy")
    : t("signup_credentials_terms_of_use", "Terms of Use");

  useEffect(() => {
    if (!source || !doc) return;
    const controller = new AbortController();
    let opened: PDFPages | null = null;
    setFailed(false);
    setBody(null);
    setZoom(0);
    void (async () => {
      const remote = legalHTTPSURL(source.remote);
      const fetched = await fetchLegalDocument(remote ? legalFetchTarget(remote, API_BASE_URL) : source.content, controller.signal);
      if (fetched.kind === "pdf") {
        opened = await openPDF(fetched.bytes, controller.signal);
        if (controller.signal.aborted) return;
        setBody({ kind: "pdf", pdf: opened });
      } else {
        setBody({ kind: "text", content: fetched.kind === "structured" ? fetched.content : htmlContent(fetched.html) });
      }
    })().catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); void opened?.destroy(); };
  }, [source, doc, attempt]);

  // Pages fill the document's width at 100%; zoom widens them.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      setWidth(Math.max(0, element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [doc]);

  const pageFailed = useRef(() => setFailed(true)).current;
  let pdfLink: string | null = null;
  try { if (source) pdfLink = legalHTTPSURL(source.remote) ?? source.pdf; } catch { /* Invalid config shows failure, not a stale link. */ }

  const close = () => { setZoom(0); onClose(); };
  // Keep the reader's place in the document when the zoom changes.
  const zoomTo = (next: number) => {
    const element = scroller.current;
    const top = element && element.scrollHeight ? element.scrollTop / element.scrollHeight : 0;
    setZoom(next);
    requestAnimationFrame(() => { if (element) element.scrollTop = top * element.scrollHeight; });
  };
  const scale = ZOOM_STEPS[zoom];
  const isPDF = body?.kind === "pdf";
  return (
    <Dialog open={doc !== null} onClose={close} title={title} labelledBy="legal-document">
      <div className="legal-zoom" role="group" aria-label={title}>
        <button type="button" className="icon-btn" onClick={() => zoomTo(Math.max(0, zoom - 1))}
          disabled={zoom === 0} aria-label="Zoom out">−</button>
        <span aria-live="polite">{Math.round(scale * 100)}%</span>
        <button type="button" className="icon-btn" onClick={() => zoomTo(Math.min(ZOOM_STEPS.length - 1, zoom + 1))}
          disabled={zoom === ZOOM_STEPS.length - 1} aria-label="Zoom in">+</button>
      </div>
      <div ref={scroller} className={`legal-document${isPDF && !failed ? " legal-pdf-pages" : ""}`} lang="en" dir="ltr" tabIndex={0} aria-label={title}
        style={isPDF ? undefined : { fontSize: `${14 * scale}px` }}>
        {failed ? (
          <div className="legal-missing" role="alert">
            <p>{t("general_network_title", "Cannot communicate with server.")}</p>
            <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t("general_try_again", "Try Again")}</Button>
          </div>
        ) : !body ? <Spinner />
          : body.kind === "pdf" ? body.pdf.sizes.map((_, i) => (
            <PDFPage key={i} pdf={body.pdf} index={i} cssWidth={Math.floor(width * scale)} root={scroller} onError={pageFailed} />
          ))
          : body.content.blocks.map((b, i) => (
            b.t === "h" ? <h3 key={i}>{runs(b.r)}</h3>
              : b.t === "li" ? <p key={i} className="legal-li">{runs(b.r)}</p>
              : <p key={i}>{runs(b.r)}</p>
          ))}
      </div>
      {pdfLink && <a className="link legal-pdf" href={pdfLink} target="_blank" rel="noopener noreferrer">{t("general_open", "Open document")}</a>}
      <Button variant="outline" onClick={close}>{t("general_ok", "OK")}</Button>
    </Dialog>
  );
}
