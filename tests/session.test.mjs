// Sign-in renewal and the Connection Problem window (parity review v4.0, Q1 and Q2),
// exercised on the real API client with a scripted `fetch`.
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

const store = new Map();
const events = [];
const win = new EventTarget();
Object.assign(win, {
  setTimeout, clearTimeout,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
});
globalThis.window = win;
for (const name of ["carezaar:session-expired", "carezaar:connection-problem"]) {
  win.addEventListener(name, (e) => events.push(name === "carezaar:session-expired" ? "expired" : `problem:${e.detail}`));
}

/** Scripted server: `routes[path]` answers each call in turn (a Response, or "drop" for
 *  a connection that fails); every call is counted. */
let routes = {};
const calls = {};
globalThis.fetch = async (url) => {
  const path = new URL(url).pathname.replace(/^\/api\//, "");
  calls[path] = (calls[path] ?? 0) + 1;
  const queue = routes[path] ?? [];
  const next = queue.length > 1 ? queue.shift() : queue[0];
  if (!next || next === "drop") throw new TypeError("Failed to fetch");
  return next();
};
const json = (status, body) => () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const refused = json(403, { result: null, message: "Token is invalid!", errors: null });
const renewed = json(200, { result: { access_token: "new-access", refresh_token: "new-refresh" } });

const { api, retryRenewal } = await import("../src/api/client.ts");

function signedIn() {
  store.set("carezaar.accessToken", "old-access");
  store.set("carezaar.refreshToken", "old-refresh");
  events.length = 0;
  for (const k of Object.keys(calls)) delete calls[k];
}

test("Q1: a server error answering the renewal signs the person out, without Connection Problem", async () => {
  signedIn();
  routes = { "users/chats": [refused], "auth/refresh": [json(500, { message: "Server Error" })] };
  await assert.rejects(api.send({ method: "GET", path: "users/chats" }), (e) => e.kind === "unauthenticated");
  assert.deepEqual(events, ["expired"]);
  assert.equal(store.get("carezaar.accessToken"), undefined);
});

test("Q1: a refusal of the renewal (401) signs the person out", async () => {
  signedIn();
  routes = { "users/chats": [refused], "auth/refresh": [json(401, { message: "Unauthenticated." })] };
  await assert.rejects(api.send({ method: "GET", path: "users/chats" }));
  assert.deepEqual(events, ["expired"]);
});

test("Q2: an unreachable renewal opens one window; requests fail at once and are not repeated after Retry", async () => {
  signedIn();
  routes = { "users/chats": [refused], "users/notifications/count": [refused], "users/chats/1": [refused], "auth/refresh": ["drop"] };
  // The first request opens the window and fails with the connection error straight away.
  await assert.rejects(api.send({ method: "GET", path: "users/chats" }), (e) => e.kind === "network");
  assert.deepEqual(events, ["problem:true"]);
  // While it is open: no renewal attempt of their own, an immediate connection error.
  await assert.rejects(api.send({ method: "GET", path: "users/notifications/count" }), (e) => e.kind === "network");
  await assert.rejects(api.send({ method: "POST", path: "users/chats/1", form: { message: "hi" } }), (e) => e.kind === "network");
  assert.equal(calls["auth/refresh"], 1);
  // Retry while the server is still unreachable: the window stays.
  assert.equal(await retryRenewal(), false);
  assert.deepEqual(events, ["problem:true"]);
  // Retry succeeds: the window closes and the new sign-in is stored.
  routes["auth/refresh"] = [renewed];
  assert.equal(await retryRenewal(), true);
  assert.deepEqual(events, ["problem:true", "problem:false"]);
  assert.equal(store.get("carezaar.accessToken"), "new-access");
  // Nothing that failed while it was open was sent again.
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls["users/chats"], 1);
  assert.equal(calls["users/notifications/count"], 1);
  assert.equal(calls["users/chats/1"], 1);
});

test("Q1 + Q2: Retry answered with an error signs the person out and closes the window", async () => {
  signedIn();
  routes = { "users/chats": [refused], "auth/refresh": ["drop"] };
  await assert.rejects(api.send({ method: "GET", path: "users/chats" }), (e) => e.kind === "network");
  routes["auth/refresh"] = [json(500, { message: "Server Error" })];
  assert.equal(await retryRenewal(), true);
  assert.deepEqual(events, ["problem:true", "expired", "problem:false"]);
  assert.equal(store.get("carezaar.accessToken"), undefined);
});

test("a renewed sign-in sends the refused request once more", async () => {
  signedIn();
  routes = { "users/chats": [refused, json(200, { result: [{ id: 1 }], meta: null })], "auth/refresh": [renewed] };
  const result = await api.send({ method: "GET", path: "users/chats" });
  assert.deepEqual(result, [{ id: 1 }]);
  assert.deepEqual(events, []);
  assert.equal(calls["users/chats"], 2);
});
