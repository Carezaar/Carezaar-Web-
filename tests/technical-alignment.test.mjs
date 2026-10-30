// "Carezaar — Technical Alignment Tasks" (client, 26 Oct 2026), Web items 1-8, against the
// Android 1.0.0 APK (decompiled; see CAREZAAR_TECHNICAL_ALIGNMENT_AUDIT.md for the evidence).
// The real API client runs on a scripted `fetch` and scripted timers, so retry delays and the
// 120 s deadline are checked without waiting.
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// The app's sources import each other without extensions (Vite resolves them).
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); } catch (error) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});

/* ------------------------------------------------------------------ environment */

const store = new Map();
let storageFault = null; // "write-throws" | "write-lost" | "read-throws"
const events = [];
/** Waits the code asked for, in order; the 120 s deadlines are held to be fired by hand. */
const waits = [];
let deadlines = [];
const win = new EventTarget();
Object.assign(win, {
  setTimeout: (fn, ms) => {
    if (ms === 120_000) { const d = { fn, cleared: false }; deadlines.push(d); return d; }
    waits.push(ms); queueMicrotask(fn); return { fn, cleared: false };
  },
  clearTimeout: (d) => { if (d) d.cleared = true; },
  localStorage: {
    getItem: (k) => { if (storageFault === "read-throws") throw new Error("storage"); return store.has(k) ? store.get(k) : null; },
    setItem: (k, v) => {
      if (storageFault === "write-throws") throw new DOMException("quota", "QuotaExceededError");
      if (storageFault === "write-lost") return;
      store.set(k, String(v));
    },
    removeItem: (k) => store.delete(k),
  },
});
globalThis.window = win;
win.addEventListener("carezaar:session-expired", () => events.push("expired"));

/** Scripted server: `routes["METHOD path"]` answers each call in turn with a Response, a
 *  function returning one (it gets the request), or "drop" (no answer). */
let routes = {};
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const path = new URL(url).pathname.replace(/^\/api\//, "");
  const key = `${init.method ?? "GET"} ${path}`;
  calls.push({ key, headers: { ...init.headers }, body: String(init.body ?? ""), signal: init.signal });
  const queue = routes[key] ?? [];
  const next = queue.length > 1 ? queue.shift() : queue[0];
  if (next === undefined) throw new Error(`unscripted ${key}`);
  if (next === "drop") throw new TypeError("Failed to fetch");
  return typeof next === "function" ? next(init) : next.clone();
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ok = (result) => json(200, { result, meta: null, message: "Successful Operation", errors: null });
const count = (key) => calls.filter((c) => c.key === key).length;
const settle = () => new Promise((resolve) => setImmediate(resolve));

const validation = await import("../src/validation/validation.ts");
const { api, REQUEST_TIMEOUT_MS } = await import("../src/api/client.ts");
const { tokenStore } = await import("../src/api/session.ts");
const { ApiError } = await import("../src/api/errors.ts");
const { userService } = await import("../src/api/services.ts");
const idem = await import("../src/api/idempotency.ts");

function reset() {
  routes = {}; calls.length = 0; waits.length = 0; deadlines = []; events.length = 0; storageFault = null;
  store.clear(); idem.clearPendingSubmissions(); store.clear();
  tokenStore.save({ access_token: "access-1", refresh_token: "refresh-1" });
  idem.setIdempotencyAccount("account-a");
}

/* ------------------------------------------------- 1. password rules (Android e54.m) */

const failing = (p, set) => validation.passwordRules(p, set).filter((r) => !r.satisfied).map((r) => r.id);

test("W1: rules in Android's order, and the first unmet one is reported", () => {
  assert.deepEqual(validation.passwordRules("").map((r) => r.id), ["8_letters", "1_uppercase", "1_lowercase", "1_number", "1_special_symbol"]);
  assert.equal(validation.firstUnmetPasswordRule("abc").id, "8_letters", "short and missing others: length first");
  assert.equal(validation.firstUnmetPasswordRule("abcdefgh").id, "1_uppercase", "uppercase before lowercase");
  assert.equal(validation.firstUnmetPasswordRule("ABCDEFGH").id, "1_lowercase");
  assert.equal(validation.firstUnmetPasswordRule("ABCDefgh").id, "1_number");
  assert.equal(validation.firstUnmetPasswordRule("ABCDefg1").id, "1_special_symbol");
  assert.equal(validation.firstUnmetPasswordRule("ABCDef1!"), null);
  // Sign-up reports that same first rule under the password field.
  const t = (_slug, fallback) => fallback;
  assert.equal(validation.signUpErrors({ email: "a@b.co", password: "abcdefgh", confirmation: "abcdefgh", accepted: true }, t).password, "At least 1 uppercase letter");
});

test("W1: length counts UTF-16 units, exactly at the 8 boundary", () => {
  assert.deepEqual(failing("Ab1!xyz"), ["8_letters"], "7 units");
  assert.deepEqual(failing("Ab1!wxyz"), [], "8 units");
  // An emoji is two UTF-16 units, as in Kotlin: "Ab1!" + two emoji is 8 units (6 characters).
  assert.deepEqual(failing("Ab1!\u{1F600}\u{1F600}"), []);
  assert.deepEqual(failing("Ab1!\u{1F600}x"), ["8_letters"], "7 units");
});

test("W1: letters and digits are ASCII only; other scripts don't count", () => {
  assert.deepEqual(failing("ÄÖÜabcd1!"), ["1_uppercase"], "accented capitals aren't A-Z");
  assert.deepEqual(failing("ABCDéüñ1!"), ["1_lowercase"], "accented small letters aren't a-z");
  assert.deepEqual(failing("ABCDabc٣!"), ["1_number"], "an Arabic-Indic digit isn't 0-9");
  assert.deepEqual(failing("ＡBCDabc1!"), [], "a full-width letter is allowed but the plain B counts");
});

test("W1: Java's pattern semantics: a line break in the password fails every character rule", () => {
  assert.deepEqual(failing("Abcdef1!\n"), ["1_uppercase", "1_lowercase", "1_number", "1_special_symbol"]);
  assert.deepEqual(failing("Abcdef1! "), ["1_uppercase", "1_lowercase", "1_number", "1_special_symbol"]);
  assert.deepEqual(failing("Abcdef1!\t"), [], "a tab is not a line terminator");
});

test("W1: the exact special set on every password screen", () => {
  for (const c of "!@#$%^&*()_+[]{}|-;:,.<>?") assert.deepEqual(failing(`Abcdefg1${c}`), [], `full set: ${c}`);
  for (const c of "~=/\\'\"` §€") assert.deepEqual(failing(`Abcdefg1${c}`), ["1_special_symbol"], `not special: ${JSON.stringify(c)}`);
  assert.equal(validation.CHANGE_PASSWORD_SPECIAL_CHARACTERS, undefined);
});

/* ------------------------------------------- 2-3. reset and change-password gates */

test("W2: Set Up Password needs only a five-digit code and two nonblank, identical passwords", () => {
  const can = validation.canSubmitPasswordReset;
  assert.equal(can("12345", "weak", "weak"), true, "strength is the API's to judge");
  assert.equal(can("1234", "Abcdef1!", "Abcdef1!"), false, "four digits");
  assert.equal(can("123456", "Abcdef1!", "Abcdef1!"), false, "six digits");
  assert.equal(can("12a45", "Abcdef1!", "Abcdef1!"), false, "a letter");
  assert.equal(can("١٢٣٤٥", "Abcdef1!", "Abcdef1!"), false, "non-ASCII digits");
  assert.equal(can("12345", "", ""), false, "blank");
  assert.equal(can("12345", "   ", "   "), false, "whitespace only is blank");
  assert.equal(can("12345", "Abcdef1!", "Abcdef1?"), false, "mismatch");
});

test("W3: Change Password needs three nonblank fields and identical new passwords", () => {
  const can = validation.canSubmitPasswordChange;
  assert.equal(can("old", "new", "new"), true, "strength is the API's to judge");
  assert.equal(can("", "new", "new"), false);
  assert.equal(can(" ", "new", "new"), false);
  assert.equal(can("old", " ", " "), false);
  assert.equal(can("old", "new", "New"), false);
});

/* ------------------------------------------------------------- 4. GET retries */

test("W4: a read is tried 4 times, 500, 1,000 and 1,500 ms apart, then fails with the connection error", async () => {
  reset();
  routes["GET users/notifications/count"] = ["drop"];
  await assert.rejects(api.send({ method: "GET", path: "users/notifications/count" }), (e) => e instanceof ApiError && e.kind === "network");
  assert.equal(count("GET users/notifications/count"), 4);
  assert.deepEqual(waits, [500, 1_000, 1_500]);
});

test("W4: a read that succeeds on a retry returns its answer; an HTTP error is never retried", async () => {
  reset();
  routes["GET users/notifications/count"] = ["drop", "drop", ok({ count: 3 })];
  assert.deepEqual(await api.send({ method: "GET", path: "users/notifications/count" }), { count: 3 });
  assert.deepEqual(waits, [500, 1_000]);
  reset();
  routes["GET users/notifications/count"] = [json(500, { message: "Server Error" })];
  await assert.rejects(api.send({ method: "GET", path: "users/notifications/count" }), (e) => e.kind === "server");
  assert.equal(count("GET users/notifications/count"), 1);
  assert.deepEqual(waits, []);
});

test("W4: writes are never repeated automatically", async () => {
  reset();
  routes["POST users/bookmarks"] = ["drop"];
  await assert.rejects(api.send({ method: "POST", path: "users/bookmarks", form: { user_id: "x" } }), (e) => e.kind === "network");
  assert.equal(count("POST users/bookmarks"), 1);
  assert.deepEqual(waits, []);
});

test("W4: a read that times out is not retried", async () => {
  reset();
  let attempts = 0;
  routes["GET users/notifications/count"] = [(init) => {
    attempts++;
    return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  }];
  const pending = api.send({ method: "GET", path: "users/notifications/count" });
  await settle(); deadlines.shift().fn();
  await assert.rejects(pending, (e) => e instanceof ApiError && e.kind === "timeout");
  assert.equal(attempts, 1);
  assert.deepEqual(waits, []);
});

/* -------------------------------------------- 5. password-change renewal and replay */

test("W5: a refused password change renews the sign-in and is sent once more, no further", async () => {
  reset();
  routes["PATCH users/password/change"] = [json(403, { message: "Token is invalid!" }), ok(null)];
  routes["PUT auth/refresh"] = [ok({ access_token: "access-2", refresh_token: "refresh-2" })];
  await userService.changePassword("Old1!pass", "New1!pass");
  const sent = calls.filter((c) => c.key === "PATCH users/password/change");
  assert.equal(sent.length, 2);
  assert.equal(sent[0].headers.Authorization, "Bearer access-1");
  assert.equal(sent[1].headers.Authorization, "Bearer access-2");
  assert.equal(sent[1].body, sent[0].body, "the same change, once more");
  assert.equal(count("PUT auth/refresh"), 1);

  reset();
  routes["PATCH users/password/change"] = [json(403, { message: "Token is invalid!" })];
  routes["PUT auth/refresh"] = [ok({ access_token: "access-2", refresh_token: "refresh-2" })];
  await assert.rejects(userService.changePassword("Old1!pass", "New1!pass"), (e) => e.kind === "unauthenticated");
  assert.equal(count("PATCH users/password/change"), 2, "the second refusal is final: no loop");
  assert.equal(count("PUT auth/refresh"), 1);
});

test("W5: when the renewal itself is refused, the change isn't sent again and the person is signed out", async () => {
  reset();
  routes["PATCH users/password/change"] = [json(403, { message: "Token is invalid!" })];
  routes["PUT auth/refresh"] = [json(403, { message: "Token is invalid!" })];
  await assert.rejects(userService.changePassword("Old1!pass", "New1!pass"));
  assert.equal(count("PATCH users/password/change"), 1);
  assert.equal(tokenStore.accessToken, null);
  assert.deepEqual(events, ["expired"]);
});

test("Renewal answered 200 without a usable session (malformed, no result, no token) signs the person out", async () => {
  for (const answer of [new Response("{", { status: 200 }), ok(null), ok({ access_token: "a" }), ok({ access_token: "", refresh_token: "" })]) {
    reset();
    routes["GET users/notifications/count"] = [json(403, { message: "Token is invalid!" })];
    routes["PUT auth/refresh"] = [answer];
    await assert.rejects(api.send({ method: "GET", path: "users/notifications/count" }));
    assert.equal(tokenStore.accessToken, null);
    assert.equal(tokenStore.refreshToken, null);
    assert.deepEqual(events, ["expired"]);
    assert.equal(count("GET users/notifications/count"), 1, "nothing is replayed without a session");
  }
});

/* ---------------------------------------------------------- 6. response deadline */

const heldBody = () => {
  let controller;
  const response = new Response(new ReadableStream({ start(c) { controller = c; } }), { status: 200, headers: { "Content-Type": "application/json" } });
  return { response, controller: () => controller };
};

test("W6: the 120 s deadline covers the body: a body that never finishes is a timeout, not a success", async () => {
  reset();
  assert.equal(REQUEST_TIMEOUT_MS, 120_000);
  const held = heldBody();
  routes["POST users/bookmarks"] = [(init) => {
    init.signal.addEventListener("abort", () => held.controller().error(new DOMException("aborted", "AbortError")));
    return held.response;
  }];
  const pending = api.send({ method: "POST", path: "users/bookmarks", form: { user_id: "x" } });
  await settle();
  held.controller().enqueue(new TextEncoder().encode('{"result":'));
  await settle();
  assert.equal(deadlines.length, 1);
  assert.equal(deadlines[0].cleared, false, "still running after the headers arrived");
  deadlines[0].fn();
  await assert.rejects(pending, (e) => e instanceof ApiError && e.kind === "timeout");
});

test("W6: a body cut off part-way fails as a connection error, never an empty success", async () => {
  reset();
  const held = heldBody();
  routes["POST users/bookmarks"] = [() => held.response];
  const pending = api.sendOptional({ method: "POST", path: "users/bookmarks", form: { user_id: "x" } });
  await settle();
  held.controller().enqueue(new TextEncoder().encode('{"result":{"id"'));
  held.controller().error(new TypeError("network error"));
  await assert.rejects(pending, (e) => e instanceof ApiError && e.kind === "network");
});

test("W6: a slow body that completes in time succeeds and its deadline is cleared", async () => {
  reset();
  const held = heldBody();
  routes["GET users/notifications/count"] = [() => held.response];
  const pending = api.send({ method: "GET", path: "users/notifications/count" });
  await settle();
  held.controller().enqueue(new TextEncoder().encode('{"result":{"count":2},'));
  await settle();
  held.controller().enqueue(new TextEncoder().encode('"meta":null}'));
  held.controller().close();
  assert.deepEqual(await pending, { count: 2 });
  assert.equal(deadlines[0].cleared, true);
});

/* ---------------------------------------------------- 7. pending keys past 24 hours */

const issueForm = { title: "Login", description: "Can't sign in" };
const scope = (account) => `${account}|issue|issues|${idem.payloadHash(issueForm)}`;
const issue = (id) => ({ id, issuetype_id: null, title: "Login", description: "Can't sign in", reply: null, created_at: null, replied_at: null, is_replied: false });

test("W7: an unresolved key saved 25 hours ago is reused, not replaced", async () => {
  reset();
  const old = { key: "6d7c2b1e-0d1f-4a5b-9c8d-7e6f5a4b3c2d", created: Date.now() - 25 * 60 * 60 * 1000, account: "account-a", operation: "issue", target: "issues", after: 4 };
  store.set("carezaar.pendingSubmissions.v1", JSON.stringify({ [scope("account-a")]: old }));
  routes["POST users/issues"] = [ok(issue(5))];
  const filed = await userService.createIssue({ issuetypeId: null, title: "Login", description: "Can't sign in" }, 4);
  assert.equal(filed.id, 5);
  const post = calls.find((c) => c.key === "POST users/issues");
  assert.equal(post.headers["Idempotency-Key"], old.key);
  assert.equal(idem.pendingSubmissions("issue", "issues").length, 0, "retired once confirmed");
});

test("W7: 25 hours on, a key the server has forgotten is reported and kept, with nothing read", async () => {
  reset();
  const old = { key: "6d7c2b1e-0d1f-4a5b-9c8d-7e6f5a4b3c2d", created: Date.now() - 25 * 60 * 60 * 1000, account: "account-a", operation: "issue", target: "issues" };
  store.set("carezaar.pendingSubmissions.v1", JSON.stringify({ [scope("account-a")]: old }));
  routes["POST users/issues"] = [json(409, { result: null, meta: { code: "idempotency_expired" }, message: "Expired" })];
  await assert.rejects(userService.createIssue({ issuetypeId: null, title: "Login", description: "Can't sign in" }));
  assert.equal(count("POST users/issues"), 1);
  assert.equal(count("GET users/issues"), 0);
  assert.equal(idem.pendingSubmissions("issue", "issues")[0].key, old.key);
});

test("W7: another account's pending record is never used", async () => {
  reset();
  const theirs = { key: "11111111-1111-4111-8111-111111111111", created: Date.now() - 30 * 60 * 60 * 1000, account: "account-b", operation: "issue", target: "issues", after: 4 };
  store.set("carezaar.pendingSubmissions.v1", JSON.stringify({ [scope("account-b")]: theirs }));
  routes["POST users/issues"] = [ok(issue(6))];
  await userService.createIssue({ issuetypeId: null, title: "Login", description: "Can't sign in" }, 4);
  assert.notEqual(calls.find((c) => c.key === "POST users/issues").headers["Idempotency-Key"], theirs.key);
  idem.setIdempotencyAccount("account-b");
  assert.equal(idem.pendingSubmissions("issue", "issues")[0].key, theirs.key, "still kept for its own account");
});

/* ----------------------------------------------------------- 8. storage failures */

const submit = (send) => idem.submitIdempotent({ operation: "chat_message", target: "7", form: { message: "Hi", parent_id: null }, send });

test("W8: if a new key can't be saved (storage throws, or silently keeps nothing), nothing is sent", async () => {
  for (const fault of ["write-throws", "write-lost"]) {
    reset();
    storageFault = fault;
    let sends = 0;
    await assert.rejects(submit(async () => { sends++; return "sent"; }), idem.SubmissionStorageError, fault);
    assert.equal(sends, 0, fault);
  }
});

test("W8: storage failing after the key was saved: a retry in this page keeps the key", async () => {
  reset();
  const keys = [];
  await assert.rejects(submit(async (key) => { keys.push(key); throw new ApiError("network", ""); }));
  storageFault = "read-throws";
  assert.equal(await submit(async (key) => { keys.push(key); return "sent"; }), "sent");
  assert.equal(keys.length, 2);
  assert.equal(keys[1], keys[0], "the same key after a lost answer");
});

test("W8: lost answer, reload, retry: the saved key is sent again", async () => {
  reset();
  const keys = [];
  await assert.rejects(submit(async (key) => { keys.push(key); throw new ApiError("network", ""); }));
  const reloaded = await import("../src/api/idempotency.ts?reload");
  reloaded.setIdempotencyAccount("account-a");
  await reloaded.submitIdempotent({ operation: "chat_message", target: "7", form: { message: "Hi", parent_id: null }, send: async (key) => { keys.push(key); return "sent"; } });
  assert.equal(keys[1], keys[0]);
});

test("W8: a key retired while storage fails isn't reused in this page", async () => {
  reset();
  const keys = [];
  await submit(async (key) => { keys.push(key); return "sent"; });
  storageFault = "write-throws";
  // The same text again is a new submission; with storage failing it can't be protected, so it isn't sent.
  await assert.rejects(submit(async (key) => { keys.push(key); return "sent"; }), idem.SubmissionStorageError);
  storageFault = null;
  await submit(async (key) => { keys.push(key); return "sent"; });
  assert.equal(keys.length, 2);
  assert.notEqual(keys[1], keys[0], "a new submission after the first was confirmed");
});

/* ------------------------------------- independent review (26 Oct 2026) regressions */

const tab = async (name) => { const m = await import(`../src/api/idempotency.ts?${name}`); m.setIdempotencyAccount("account-a"); return m; };
const hi = (m, send) => m.submitIdempotent({ operation: "chat_message", target: "7", form: { message: "Hi", parent_id: null }, draft: "Hi", send });

test("Review 1: one tab never drops another tab's unresolved key", async () => {
  reset();
  const A = await tab("r1-a"), B = await tab("r1-b");
  const keys = [];
  await hi(A, async (k) => { keys.push(k); return "ok"; }); // confirmed in tab A
  await assert.rejects(hi(B, async (k) => { keys.push(k); throw new ApiError("network", ""); })); // uncertain in tab B
  await A.submitIdempotent({ operation: "issue", target: "issues", form: { title: "x" }, send: async () => "ok" }); // A writes something else
  const B2 = await tab("r1-b-reloaded");
  await hi(B2, async (k) => { keys.push(k); return "ok"; });
  assert.equal(keys[2], keys[1], "tab B's retry after a reload still sends its own key");
});

test("Review 2: a key another tab confirmed isn't revived; a new identical send gets a new key", async () => {
  reset();
  const A = await tab("r2-a"), B = await tab("r2-b");
  const keys = [];
  await assert.rejects(hi(A, async (k) => { keys.push(k); throw new ApiError("network", ""); }));
  await hi(B, async (k) => { keys.push(k); return "ok"; }); // B retries the same submission, confirmed
  assert.equal(keys[1], keys[0]);
  assert.equal(A.pendingSubmissions("chat_message", "7").length, 0, "tab A sees it resolved");
  await hi(A, async (k) => { keys.push(k); return "ok"; });
  assert.notEqual(keys[2], keys[0], "a deliberate new 'Hi' isn't sent with the confirmed key");
});

test("Review: a key retired while storage can't be written stays retired in this page", async () => {
  reset();
  const keys = [];
  await assert.rejects(submit(async (k) => { keys.push(k); throw new ApiError("network", ""); }));
  storageFault = "write-throws";
  await submit(async (k) => { keys.push(k); return "sent"; }); // confirmed; removing it from storage fails
  assert.equal(idem.pendingSubmissions("chat_message", "7").length, 0, "not offered again here");
  storageFault = null;
  await submit(async (k) => { keys.push(k); return "sent"; });
  assert.notEqual(keys[2], keys[0], "the next identical message is a new submission");
});

test("Review 4: a refused password change whose renewal can't reach the server is known not to have happened", async () => {
  reset();
  const { RefusedWhileRenewalUnreachableError } = await import("../src/api/errors.ts");
  routes["PATCH users/password/change"] = [json(403, { message: "Token is invalid!" })];
  routes["PUT auth/refresh"] = ["drop"];
  await assert.rejects(userService.changePassword("Old1!pass", "New1!pass"), (e) => e instanceof RefusedWhileRenewalUnreachableError && e.kind === "network");
  assert.equal(count("PATCH users/password/change"), 1, "not sent again");
  // Not an uncertain outcome: nothing else (such as a sign-in check) is sent.
  assert.equal(count("POST auth/login"), 0);
});

test("Review 9: blank means Kotlin's isBlank", () => {
  for (const blank of ["", "   ", "\t\n\u000B\f\r", "   ", "\u001C\u001F", "  ", "　"]) assert.equal(validation.isBlank(blank), true, JSON.stringify(blank));
  for (const notBlank of ["a", " a ", "\u0085", "﻿", "​"]) assert.equal(validation.isBlank(notBlank), false, JSON.stringify(notBlank));
});

/* --------------------------------------------- second review round (26 Oct 2026) */

test("Review N2: a confirmed key whose removal failed stays retired after a blocked new send", async () => {
  reset();
  const keys = [];
  await submit(async (k) => { keys.push(k); return "sent"; }); // saved fine...
  storageFault = "write-throws";                                // ...then removing it fails
  await assert.rejects(submit(async (k) => { keys.push(k); return "x"; }), idem.SubmissionStorageError, "a new 'Hi' can't be protected");
  await assert.rejects(submit(async (k) => { keys.push(k); return "x"; }), idem.SubmissionStorageError, "nor on the second tap");
  assert.equal(keys.length, 1, "the confirmed key is never sent again");
  storageFault = null;
  await submit(async (k) => { keys.push(k); return "sent"; });
  assert.notEqual(keys[1], keys[0], "once storage works, the new message gets its own key");
});

test("Review N4: unreadable stored text doesn't block new submissions; it is replaced", async () => {
  for (const junk of ["{", "null", "[1,2]", "\"text\""]) {
    reset();
    store.set("carezaar.pendingSubmissions.v1", junk);
    let sends = 0;
    await assert.rejects(submit(async () => { sends++; throw new ApiError("network", ""); }));
    assert.equal(sends, 1, junk);
    assert.equal(idem.pendingSubmissions("chat_message", "7").length, 1, `saved over ${junk}`);
  }
});
