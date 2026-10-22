import type { LegalContent } from "./legalDocuments";

const WORKER_URL = () => new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).href;
// Canvas backing stores beyond this edge length, or above 2x density, use too much memory on phones.
const MAX_CANVAS_EDGE = 4096;

type PDFDocument = Awaited<ReturnType<typeof import("pdfjs-dist/legacy/build/pdf.mjs")["getDocument"]>["promise"]>;

async function load(bytes: Uint8Array, workerURL: string) {
  const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdf.GlobalWorkerOptions.workerSrc = workerURL;
  return pdf.getDocument({ data: bytes, useSystemFonts: true });
}

/** A page's text in reading order, one string per line. */
async function pageLines(document: PDFDocument, pageNumber: number): Promise<string[]> {
  const page = await document.getPage(pageNumber);
  const content = await page.getTextContent();
  const lines: string[] = [];
  let line = "";
  for (const item of content.items) {
    if (!("str" in item)) continue;
    line += item.str + " ";
    if (item.hasEOL && line.trim()) { lines.push(line.trim()); line = ""; }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export async function pdfContent(bytes: Uint8Array, signal: AbortSignal, workerURL = WORKER_URL()): Promise<LegalContent> {
  const task = await load(bytes, workerURL);
  const abort = () => { void task.destroy(); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const document = await task.promise;
    const blocks: LegalContent["blocks"] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      signal.throwIfAborted();
      for (const line of await pageLines(document, pageNumber)) blocks.push({ t: "p", r: [[line, false]] });
    }
    if (!blocks.length) throw new Error("Document has no readable text.");
    return { title: "", blocks };
  } finally { signal.removeEventListener("abort", abort); await task.destroy(); }
}

/** The published PDF itself, for drawing its pages as they are (layout, fonts, headings). */
export interface PDFPages {
  /** Page sizes in PDF points, in order. */
  sizes: { width: number; height: number }[];
  /** Draws a page into `canvas` at `cssWidth` CSS pixels wide, sharp on high-density screens. */
  render(index: number, canvas: HTMLCanvasElement, cssWidth: number, signal: AbortSignal): Promise<void>;
  /** The page's text, for screen readers. */
  text(index: number): Promise<string>;
  destroy(): Promise<void>;
}

export async function openPDF(bytes: Uint8Array, signal: AbortSignal, workerURL = WORKER_URL()): Promise<PDFPages> {
  const task = await load(bytes, workerURL);
  const abort = () => { void task.destroy(); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const document = await task.promise;
    const sizes: PDFPages["sizes"] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      signal.throwIfAborted();
      const [x0, y0, x1, y1] = (await document.getPage(pageNumber)).view;
      sizes.push({ width: x1 - x0, height: y1 - y0 });
    }
    if (!sizes.length) throw new Error("Document has no pages.");
    return {
      sizes,
      async render(index, canvas, cssWidth, renderSignal) {
        const page = await document.getPage(index + 1);
        const base = page.getViewport({ scale: 1 });
        const ratio = Math.min(globalThis.devicePixelRatio || 1, 2, MAX_CANVAS_EDGE / cssWidth, MAX_CANVAS_EDGE * base.width / (cssWidth * base.height));
        const viewport = page.getViewport({ scale: (cssWidth * ratio) / base.width });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const task = page.render({ canvas, viewport });
        const cancel = () => task.cancel();
        renderSignal.addEventListener("abort", cancel, { once: true });
        try { await task.promise; } finally { renderSignal.removeEventListener("abort", cancel); }
      },
      async text(index) { return (await pageLines(document, index + 1)).join("\n"); },
      destroy: () => task.destroy(),
    };
  } catch (error) {
    await task.destroy();
    throw error;
  } finally { signal.removeEventListener("abort", abort); }
}
