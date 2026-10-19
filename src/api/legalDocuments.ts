/** A newly fetched document; no module-level cache or retained success promise. */
export type LegalRun = [string, boolean];
export interface LegalContent { title: string; blocks: { t: "h" | "p" | "li"; r: LegalRun[] }[] }
export type LegalBody = { kind: "structured"; content: LegalContent } | { kind: "html"; html: string } | { kind: "pdf"; bytes: Uint8Array };

/** Missing configuration permits the supplied local copy. Invalid configuration must fail. */
export function legalHTTPSURL(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const url = new URL(raw.trim());
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error("Legal document URL must use HTTPS without credentials.");
  return url.href;
}

export async function fetchLegalDocument(url: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<LegalBody> {
  const response = await fetcher(url, { signal, cache: "no-store", credentials: "omit",
    headers: { Accept: "application/pdf, text/html, application/json" } });
  if (!response.ok) throw new Error(`Document request failed: ${response.status}`);
  if (url.startsWith("https:") && response.url && new URL(response.url).protocol !== "https:") throw new Error("Insecure document redirect.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("Document exceeds the viewer size limit.");
  signal.throwIfAborted();
  const type = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (type === "application/pdf" || new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return { kind: "pdf", bytes };
  const text = new TextDecoder().decode(bytes);
  if (type === "text/html") return { kind: "html", html: text };
  if (type === "application/json") {
    const content = JSON.parse(text) as LegalContent;
    if (!Array.isArray(content.blocks) || content.blocks.length === 0 || !content.blocks.every((b) => ["h", "p", "li"].includes(b.t) && Array.isArray(b.r)
      && b.r.every((r) => Array.isArray(r) && typeof r[0] === "string" && typeof r[1] === "boolean"))) throw new Error("Invalid document content.");
    return { kind: "structured", content };
  }
  throw new Error("Unsupported document format.");
}
