import type { LegalContent } from "./legalDocuments";

export async function pdfContent(bytes: Uint8Array, signal: AbortSignal, workerURL = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).href): Promise<LegalContent> {
  const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdf.GlobalWorkerOptions.workerSrc = workerURL;
  const task = pdf.getDocument({ data: bytes, useSystemFonts: true });
  const abort = () => { void task.destroy(); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const document = await task.promise;
    const blocks: LegalContent["blocks"] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      signal.throwIfAborted();
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let line = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str + " ";
        if (item.hasEOL && line.trim()) { blocks.push({ t: "p", r: [[line.trim(), false]] }); line = ""; }
      }
      if (line.trim()) blocks.push({ t: "p", r: [[line.trim(), false]] });
      page.cleanup();
    }
    if (!blocks.length) throw new Error("Document has no readable text.");
    return { title: "", blocks };
  } finally { signal.removeEventListener("abort", abort); await task.destroy(); }
}

