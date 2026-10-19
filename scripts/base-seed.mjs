// Writes <outDir>/base-seed.json: every reference list exactly as the server serves it
// (each envelope's `result`), together with the server's `ts_cache` marker.
//
// The server answers the 23 `base/` reads mostly one after another (about a second
// each), so a first visit that downloads them all waits 6-8 s. With this snapshot the
// app downloads nothing when `base/info` still reports the snapshot's marker, and falls
// back to the normal downloads when it does not (src/app/baseDataLoader.ts).
//
// The snapshot is optional: if any read fails, or the marker moves while reading, no
// file is written and the app behaves as before. The build never fails because of it.
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: node scripts/base-seed.mjs <outDir>");
const target = path.join(outDir, "base-seed.json");
fs.rmSync(target, { force: true });

const API = process.env.VITE_CAREZAAR_API_BASE_URL ?? "https://new.carezaar.com/api/";
const LISTS = [
  "careconditions", "caredays", "carespecials", "certifications", "clienttypes",
  "commutes", "contents", "countries", "experiences", "genders", "issuetypes",
  "languageskills", "reasons", "roles", "shifts", "subjects", "worktypes",
  "states", "media", "faqs", "faq_categories", "languages",
];

async function read(name) {
  const url = new URL(`base/${name}`, API);
  url.searchParams.set("ts_cache", "0");
  // The backend 500s on Node's default "Accept-Language: *" (the app sends its language
  // code). Only the envelope's message is localised; every `result` is the same in each
  // language, so one snapshot serves all of them.
  const response = await fetch(url, {
    headers: { Accept: "application/json", "Accept-Language": "en" }, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const { result } = await response.json();
  if (result === null || result === undefined) throw new Error(`${name}: no result`);
  return result;
}

try {
  const before = (await read("info")).ts_cache;
  if (typeof before !== "number" || before <= 0) throw new Error("info: no ts_cache");
  const lists = {};
  // A few at a time: the server handles only a handful of requests at once.
  for (let i = 0; i < LISTS.length; i += 4) {
    await Promise.all(LISTS.slice(i, i + 4).map(async (name) => { lists[name] = await read(name); }));
  }
  const after = (await read("info")).ts_cache;
  if (after !== before) throw new Error(`ts_cache moved while reading (${before} -> ${after})`);
  fs.writeFileSync(target, JSON.stringify({ ts_cache: before, lists }));
  console.log(`base-seed: ${LISTS.length} lists at ts_cache ${before} (${fs.statSync(target).size} bytes)`);
} catch (error) {
  console.warn(`base-seed: skipped, the app will download the lists on a first visit (${error.message})`);
}
