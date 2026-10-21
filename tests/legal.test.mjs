import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { legalHTTPSURL, fetchLegalDocument, legalFetchTarget } from "../src/api/legalDocuments.ts";
import { pdfContent } from "../src/api/legalPDF.ts";

test("legal configuration accepts HTTPS only and distinguishes missing from invalid", () => {
  assert.equal(legalHTTPSURL(undefined), null);
  assert.equal(legalHTTPSURL("  "), null);
  assert.equal(legalHTTPSURL(" https://documents.example/terms.pdf "), "https://documents.example/terms.pdf");
  for (const address of ["http://documents.example/terms", "javascript:alert(1)", "file:///terms.pdf", "https://user:secret@documents.example/terms"]) {
    assert.throws(() => legalHTTPSURL(address));
  }
});

test("remote reopening and retry perform new uncached requests against changing fixture", async () => {
  let version = 1, requests = 0, failing = false;
  const server = createServer((request, response) => {
    requests++;
    response.writeHead(failing ? 503 : 200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=31536000" });
    response.end(JSON.stringify({ title: "Fixture", blocks: [{ t: "p", r: [[`Fixture version ${version}`, false]] }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  // HTTP is used only for this local transport fixture; production config rejects it.
  const address = `http://127.0.0.1:${server.address().port}/document`;
  const signal = new AbortController().signal;
  const options = [];
  const observedFetch = (url, init) => { options.push(init); return fetch(url, init); };
  try {
    const first = await fetchLegalDocument(address, signal, observedFetch);
    assert.equal(first.content.blocks[0].r[0][0], "Fixture version 1");
    version = 2;
    const reopened = await fetchLegalDocument(address, signal, observedFetch);
    assert.equal(reopened.content.blocks[0].r[0][0], "Fixture version 2");
    failing = true;
    await assert.rejects(fetchLegalDocument(address, signal, observedFetch), /503/);
    failing = false; version = 3;
    assert.equal((await fetchLegalDocument(address, signal, observedFetch)).content.blocks[0].r[0][0], "Fixture version 3");
    assert.equal(requests, 4);
    assert.ok(options.every((option) => option.cache === "no-store" && option.credentials === "omit" && option.signal === signal));
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

test("remote formats and malformed documents are handled without stale success", async () => {
  const signal = new AbortController().signal;
  const html = await fetchLegalDocument("https://documents.example/privacy", signal,
    async () => new Response("<h1>Fixture privacy</h1><p>Current text</p>", { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  assert.equal(html.kind, "html");
  const pdf = await fetchLegalDocument("https://documents.example/terms.pdf", signal,
    async () => new Response("%PDF-1.7", { headers: { "Content-Type": "application/octet-stream" } }));
  assert.equal(pdf.kind, "pdf");
  await assert.rejects(fetchLegalDocument("https://documents.example/invalid", signal,
    async () => new Response('{"blocks":[{"t":"script","r":[]}]}', { headers: { "Content-Type": "application/json" } })), /Invalid document/);
  const stopped = new AbortController(); stopped.abort();
  await assert.rejects(fetchLegalDocument("https://documents.example/terms", stopped.signal,
    async () => new Response("%PDF-1.7")), { name: "AbortError" });
});

test("real supplied PDF bytes decode into readable current document blocks", async () => {
  const bytes = new Uint8Array(await readFile(new URL("../public/legal/terms-of-use.pdf", import.meta.url)));
  const content = await pdfContent(bytes, new AbortController().signal, import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs"));
  assert.ok(content.blocks.length > 10);
  assert.ok(content.blocks.every((block) => block.r.every(([text]) => typeof text === "string" && text.length > 0)));
  assert.match(content.blocks.map((block) => block.r[0][0]).join(" "), /Carezaar/i);
});

test("documents on the API host are read through the app's own origin; others directly", () => {
  const api = "https://new.carezaar.com/api/";
  assert.equal(legalFetchTarget("https://new.carezaar.com/terms_of_use.pdf", api), "/terms_of_use.pdf");
  assert.equal(legalFetchTarget("https://new.carezaar.com/privacy_policy.pdf?v=2", api), "/privacy_policy.pdf?v=2");
  assert.equal(legalFetchTarget("https://documents.example/terms.pdf", api), "https://documents.example/terms.pdf");
});
