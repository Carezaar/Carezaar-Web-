import test from "node:test";
import assert from "node:assert/strict";
import { pagedMerge } from "../src/app/usePaged.ts";

const key = (x) => x.id;
const ids = (list) => list.map((x) => x.id);

test("a new page is appended", () => {
  const { items, added } = pagedMerge([{ id: 1 }, { id: 2 }], [{ id: 3 }, { id: 4 }], key);
  assert.deepEqual(ids(items), [1, 2, 3, 4]);
  assert.equal(added, 2);
});

test("items already shown are not added twice (the list shifted between pages)", () => {
  const { items, added } = pagedMerge([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }], key);
  assert.deepEqual(ids(items), [1, 2, 3]);
  assert.equal(added, 1);
});

test("a page with nothing new reports zero, which ends the list", () => {
  const before = [{ id: 1 }, { id: 2 }];
  const { items, added } = pagedMerge(before, [{ id: 1 }, { id: 2 }], key);
  assert.equal(added, 0);
  assert.equal(items, before, "the same array, so nothing re-renders");
});

test("an empty page adds nothing", () => {
  assert.equal(pagedMerge([{ id: 1 }], [], key).added, 0);
});

test("duplicates inside one page are dropped", () => {
  assert.deepEqual(ids(pagedMerge([], [{ id: 5 }, { id: 5 }, { id: 6 }], key).items), [5, 6]);
});
