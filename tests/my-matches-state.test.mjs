import test from "node:test";
import assert from "node:assert/strict";
import { reconcilePages } from "../src/app/usePaged.ts";

// matchesState reads window.localStorage; give node a small in-memory one.
const store = new Map();
globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
const m = await import("../src/app/matchesState.ts");
const key = (item) => item.id;
const ids = (r) => r.items.map((x) => x.id);

test("refreshed pages are rebuilt in order, without duplicates, and drop records the server no longer lists", () => {
  // Page 1 lost id 2; id 4 moved up from page 2 into page 1, so page 2 repeats it.
  const r = reconcilePages([[{ id: 1 }, { id: 3 }, { id: 4 }], [{ id: 4 }, { id: 5 }, { id: 6 }]], key);
  assert.deepEqual(ids(r), [1, 3, 4, 5, 6]);
  assert.equal(r.page, 2);
  assert.equal(r.ended, false, "full pages: more may follow");
});

test("an empty refreshed page ends the list there, as when loading page by page", () => {
  const r = reconcilePages([[{ id: 1 }, { id: 2 }], []], key);
  assert.deepEqual(ids(r), [1, 2]);
  assert.equal(r.ended, true);
  const none = reconcilePages([[]], key);
  assert.deepEqual(none.items, []);
  assert.equal(none.ended, true, "an empty first page is the empty state");
});

test("the sort is remembered for this sign-in only and forgotten on sign-out", () => {
  const a = m.matchesKey("owner-1", "user-a", "client");
  const b = m.matchesKey("owner-2", "user-b", "caregiver");
  const again = m.matchesKey("owner-3", "user-a", "client"); // the same person after signing in again
  m.rememberSort(a, "pay");
  assert.equal(m.rememberedSort(a), "pay");
  assert.equal(m.rememberedSort(b), null, "another account starts from the default");
  assert.equal(m.rememberedSort(again), null, "a new sign-in starts from the default");
  m.forgetMatches();
  assert.equal(m.rememberedSort(a), null, "sign-out forgets it");
  assert.equal(m.matchesKey(null, "user-a", "client"), null, "no key without a sign-in");
});

test("the loaded list is returned only to the same sign-in and sort", () => {
  const a = m.matchesKey("owner-1", "user-a", "client");
  m.writeSnapshot({ key: a, sort: "pay", items: [{ id: 1 }], page: 3, ended: false, total: 30, scroll: 0 });
  m.saveScroll(a, 640);
  assert.equal(m.readSnapshot(a, "pay").scroll, 640);
  assert.equal(m.readSnapshot(a, "pay").page, 3);
  assert.equal(m.readSnapshot(a, "distance"), null, "another sort loads its own list");
  assert.equal(m.readSnapshot(m.matchesKey("owner-2", "user-b", "client"), "pay"), null, "no other account sees it");
  m.forgetMatches();
  assert.equal(m.readSnapshot(a, "pay"), null);
});

test("returning again while a refresh is running shares it instead of repeating the requests", async () => {
  let calls = 0;
  let release;
  const start = () => { calls += 1; return new Promise((ok) => { release = ok; }); };
  const first = m.sharedRefresh("k|pay|3", start);
  const second = m.sharedRefresh("k|pay|3", start);
  assert.equal(first, second);
  assert.equal(calls, 1);
  release("done");
  assert.equal(await second, "done");
  m.sharedRefresh("k|pay|3", () => { calls += 1; return Promise.resolve(); });
  assert.equal(calls, 2, "a later return refreshes again");
  m.sharedRefresh("k|distance|3", () => { calls += 1; return Promise.resolve(); });
  assert.equal(calls, 3, "a different sort is a different refresh");
});
