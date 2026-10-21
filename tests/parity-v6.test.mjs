// Parity review v6.0 (web) and v5.0 (iOS) corrections on the web: H1, C2, G2, Q1.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sentinelShouldFire } from "../src/app/sentinel.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("G2: the end of the list asks for the next page only when it comes into view", () => {
  assert.equal(sentinelShouldFire(true, false), true, "scrolled to the end");
  assert.equal(sentinelShouldFire(true, true), false, "still at the end after a failed page: nothing until the person scrolls away and back");
  assert.equal(sentinelShouldFire(false, true), false, "scrolled away");
  assert.equal(sentinelShouldFire(false, false), false);
});

test("G2: a failed further page shows no error and no Try Again", () => {
  const paged = read("src/app/usePaged.ts");
  assert.match(paged, /if \(gen === generation\.current && target === 1\) setError\(e\);/);
  assert.doesNotMatch(paged, /const retry = useCallback/);
  for (const screen of ["src/screens/main.tsx", "src/screens/account.tsx", "src/screens/matchesManage.tsx"]) {
    assert.doesNotMatch(read(screen), /list\.retry\(\)/, `${screen} has no end-of-list Try Again`);
  }
});

test("H1: withdrawing my request uses the managed Withdraw texts", () => {
  const partner = read("src/screens/partner.tsx");
  assert.equal((partner.match(/withdraw: \["match_withdraw_title", "Withdraw"\]/g) ?? []).length, 2, "window title and confirming button");
  assert.match(partner, /mainAction\("withdraw"\)\}>\{t\("match_withdraw_title", "Withdraw"\)\}/, "the profile button");
  assert.match(partner, /"match_withdraw_message"/);
  assert.doesNotMatch(partner, /withdraw: \["general_cancel"/);
});

test("C2: the agreement problem is only a pop-up message, never text under the box", () => {
  const auth = read("src/screens/auth.tsx");
  assert.match(auth, /if \(agreement\) \{ toast\(agreement\); return; \}/);
  assert.doesNotMatch(auth, /errors\.accepted/);
});

test("Q1: My Matches is not requested before the saved sign-in has been checked", () => {
  assert.doesNotMatch(read("src/main.tsx"), /Prefetch|matches\(/);
  assert.doesNotMatch(read("src/screens/main.tsx"), /Prefetch/);
});
