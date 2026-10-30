import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// The sources import each other without extensions, as Vite allows.
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); } catch (error) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});

// Duplicate-action guard and Idempotency-Key handling (client request, 25 Oct 2026).
// The modules read window.localStorage and fetch; give node small stand-ins.
const store = new Map();
globalThis.window = {
  localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  setTimeout, clearTimeout, dispatchEvent: () => true,
};
const calls = [];
let respond = () => new Response("{}", { status: 200 });
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), method: init.method, headers: { ...init.headers }, body: String(init.body ?? "") });
  return respond(String(url), init, calls.length);
};

const guard = await import("../src/app/actionGuard.ts");
const idem = await import("../src/api/idempotency.ts");
const { ApiError } = await import("../src/api/errors.ts");
/** A clean slate between tests: storage and the page's own copy of pending records. */
const resetPending = () => { store.clear(); idem.clearPendingSubmissions(); store.clear(); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

/* ------------------------------------------------------------------ guard */

test("a second action on the same resource is rejected at once, not queued", async () => {
  guard.resetGuards(); guard.setGuardAccount("user-a");
  const first = deferred();
  let runs = 0;
  const a = guard.guarded("chat:5:send", () => { runs++; return first.promise; });
  await assert.rejects(guard.guarded("chat:5:send", async () => { runs++; }), guard.DuplicateActionError);
  assert.equal(guard.isGuarded("chat:5:send"), true);
  first.resolve("sent");
  assert.equal(await a, "sent");
  assert.equal(runs, 1, "only the first ran");
  assert.equal(guard.isGuarded("chat:5:send"), false, "released after success");
});

test("accepting and rejecting the same match share one guard; another match stays usable", async () => {
  guard.resetGuards(); guard.setGuardAccount("user-a");
  const accept = deferred();
  const accepting = guard.guarded("match:partner-1", () => accept.promise);
  await assert.rejects(guard.guarded("match:partner-1", async () => "reject"), guard.DuplicateActionError);
  assert.equal(await guard.guarded("match:partner-2", async () => "other"), "other");
  assert.equal(await guard.guarded("bookmark:partner-1", async () => "favourite"), "favourite");
  accept.resolve("accepted");
  await accepting;
});

test("the guard is released after a failure and after a cancellation", async () => {
  guard.resetGuards(); guard.setGuardAccount("user-a");
  await assert.rejects(guard.guarded("issue:create", async () => { throw new Error("server"); }), /server/);
  assert.equal(guard.isGuarded("issue:create"), false);
  const controller = new AbortController();
  const cancelled = guard.guarded("issue:create", () => new Promise((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("aborted")))));
  controller.abort();
  await assert.rejects(cancelled, /aborted/);
  assert.equal(guard.isGuarded("issue:create"), false);
  assert.equal(await guard.guarded("issue:create", async () => "again"), "again");
});

test("guards belong to the signed-in account", async () => {
  guard.resetGuards(); guard.setGuardAccount("user-a");
  const held = deferred();
  const a = guard.guarded("issue:create", () => held.promise);
  guard.setGuardAccount("user-b");
  assert.equal(guard.isGuarded("issue:create"), false, "another account's action is not blocked");
  guard.setGuardAccount("user-a");
  assert.equal(guard.isGuarded("issue:create"), true);
  held.resolve(); await a;
});

/* ------------------------------------------------------------ idempotency */

const submit = (form, send, extra = {}) => idem.submitIdempotent({ operation: "chat_message", target: "7", form, send, ...extra });
const network = () => new ApiError("network", "");

test("one UUID per submission, the same key again after an uncertain failure, a new one after success", async () => {
  resetPending(); idem.setIdempotencyAccount("user-a");
  const keys = [];
  await assert.rejects(submit({ message: "Hello", parent_id: null }, async (k) => { keys.push(k); throw network(); }));
  await assert.rejects(submit({ message: "Hello", parent_id: null }, async (k) => { keys.push(k); throw new ApiError("timeout", ""); }));
  await assert.rejects(submit({ message: "Hello", parent_id: null }, async (k) => { keys.push(k); throw new ApiError("server", "", 502); }));
  await submit({ message: "Hello", parent_id: null }, async (k) => { keys.push(k); return "ok"; });
  assert.match(keys[0], UUID);
  assert.deepEqual(new Set(keys).size, 1, "every retry of the unresolved submission used the same key");
  // Confirmed: the same text again is a new, intentional message with a new key.
  await submit({ message: "Hello", parent_id: null }, async (k) => { keys.push(k); return "ok"; });
  assert.notEqual(keys.at(-1), keys[0]);
  assert.equal(idem.pendingSubmissions("chat_message", "7").length, 0, "nothing left pending after success");
});

test("different data, another account or another target never reuse a key", async () => {
  resetPending(); idem.setIdempotencyAccount("user-a");
  const keyFor = async (form, target = "7") => { let key; await assert.rejects(idem.submitIdempotent({ operation: "chat_message", target, form, send: async (k) => { key = k; throw network(); } })); return key; };
  const a = await keyFor({ message: "Hello", parent_id: null });
  assert.notEqual(await keyFor({ message: "Hello!", parent_id: null }), a);
  assert.notEqual(await keyFor({ message: "Hello", parent_id: 12 }), a, "a reply is another submission");
  assert.notEqual(await keyFor({ message: "Hello", parent_id: null }, "8"), a, "another conversation");
  idem.setIdempotencyAccount("user-b");
  assert.notEqual(await keyFor({ message: "Hello", parent_id: null }), a, "another account");
  idem.setIdempotencyAccount("user-a");
  assert.equal(await keyFor({ message: "Hello", parent_id: null }), a, "back to the first account: its own pending key");
});

test("an unfinished key survives a restart (persisted)", async () => {
  resetPending(); idem.setIdempotencyAccount("user-a");
  let first;
  await assert.rejects(submit({ message: "Are you free?", parent_id: 3 }, async (k) => { first = k; throw network(); }));
  const fresh = await import("../src/api/idempotency.ts?restart");
  fresh.setIdempotencyAccount("user-a");
  const [pending] = fresh.pendingSubmissions("chat_message", "7");
  assert.equal(pending.key, first);
  let again;
  await fresh.submitIdempotent({ operation: "chat_message", target: "7", form: { message: "Are you free?", parent_id: 3 }, send: async (k) => { again = k; return "ok"; } });
  assert.equal(again, first, "the retry after a restart sends the same key");
});

test("every failure keeps the key; only a success retires it", async () => {
  resetPending(); idem.setIdempotencyAccount("user-a");
  const keys = [];
  await assert.rejects(submit({ message: "x", parent_id: null }, async (k) => { keys.push(k); throw new ApiError("validation", "too long", 422, { message: ["too long"] }); }));
  await assert.rejects(submit({ message: "x", parent_id: null }, async (k) => { keys.push(k); throw new ApiError("unknown", "", 409, {}, { code: "idempotency_conflict" }); }));
  await assert.rejects(submit({ message: "x", parent_id: null }, async (k) => { keys.push(k); throw new ApiError("unknown", "", 409, {}, { code: "idempotency_expired" }); }));
  await assert.rejects(submit({ message: "x", parent_id: null }, async (k) => { keys.push(k); throw new ApiError("server", "", 500); }));
  assert.equal(new Set(keys).size, 1);
  assert.equal(idem.pendingSubmissions("chat_message", "7").length, 1);
  await submit({ message: "x", parent_id: null }, async (k) => { keys.push(k); return "ok"; });
  assert.equal(keys.at(-1), keys[0]);
  assert.equal(idem.pendingSubmissions("chat_message", "7").length, 0);
});

/* ------------------------------------------------- through the API client */

test("an issue is sent straight away, without reading the list first", async () => {
  resetPending(); calls.length = 0;
  idem.setIdempotencyAccount("user-a");
  store.set("carezaar.accessToken", "access"); store.set("carezaar.refreshToken", "refresh"); store.set("carezaar.sessionOwner", "owner-1");
  const { userService } = await import("../src/api/services.ts");
  respond = () => new Response(JSON.stringify({ result: { id: 8, issuetype_id: null, title: "Login", description: "Same words", reply: null, created_at: null, replied_at: null, is_replied: false } }), { status: 200 });
  assert.equal((await userService.createIssue({ issuetypeId: null, title: "Login", description: "Same words" })).id, 8);
  assert.deepEqual(calls.map((c) => c.method), ["POST"]);
});

test("the three writes send Idempotency-Key, and a renewed sign-in resends the same key", async () => {
  resetPending(); calls.length = 0;
  idem.setIdempotencyAccount("user-a");
  store.set("carezaar.accessToken", "old-access"); store.set("carezaar.refreshToken", "refresh-1"); store.set("carezaar.sessionOwner", "owner-1");
  const { userService } = await import("../src/api/services.ts");
  const chat = { id: 7, client: null, caregiver: null, updated_at: null, messages: [] };
  let refused = false; // the first write is refused once (an expired sign-in)
  respond = (url, init, n) => {
    if (url.endsWith("auth/refresh")) return new Response(JSON.stringify({ result: { access_token: "new-access", refresh_token: "refresh-2" } }), { status: 200 });
    if (!refused) { refused = true; return new Response(JSON.stringify({ message: "Token is invalid!" }), { status: 403 }); }
    if (url.includes("users/chats")) return new Response(JSON.stringify({ result: chat }), { status: 200 });
    if (url.includes("users/issues") && init.method === "GET") return new Response(JSON.stringify({ result: [] }), { status: 200 });
    if (url.includes("users/issues")) return new Response(JSON.stringify({ result: { id: 9, issuetype_id: null, title: "t", description: "d", reply: null, created_at: null, replied_at: null, is_replied: false } }), { status: 200 });
    return new Response(JSON.stringify({ result: { id: 3, client: null, caregiver: null, review_client: null, review_caregiver: null, created_at: null, finished_at: null, is_client_accepted: false, is_caregiver_accepted: true, is_active: false } }), { status: 200 });
  };
  await userService.sendMessage(7, "Hello", null);
  const posts = calls.filter((c) => c.method === "POST");
  assert.equal(posts.length, 2, "refused once, renewed, sent once more");
  assert.match(posts[0].headers["Idempotency-Key"], UUID);
  assert.equal(posts[1].headers["Idempotency-Key"], posts[0].headers["Idempotency-Key"], "the resend after renewal keeps the key");
  assert.equal(posts[1].headers.Authorization, "Bearer new-access");
  calls.length = 0;
  await userService.createIssue({ issuetypeId: null, title: "t", description: "d" });
  await userService.requestMatch("partner-9", "Hi");
  const [issue, match] = calls.filter((c) => c.method === "POST");
  assert.ok(issue.url.endsWith("users/issues") && UUID.test(issue.headers["Idempotency-Key"]));
  assert.ok(match.url.endsWith("users/matches") && UUID.test(match.headers["Idempotency-Key"]));
  assert.notEqual(issue.headers["Idempotency-Key"], match.headers["Idempotency-Key"]);
  calls.length = 0;
  await userService.addBookmark("partner-9");
  assert.equal(calls[0].headers["Idempotency-Key"], undefined, "only the three named writes carry a key");
});
