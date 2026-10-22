import test from "node:test";
import assert from "node:assert/strict";
import { exitPast } from "../src/navigation/back.ts";

test("saving the editor leaves past every wizard step to the screen that opened it", () => {
  // Opened from Profile (in-app position 4), three steps added: back 4 entries, to Profile.
  assert.deepEqual(exitPast(7, 3, "/main/matches"), { back: 4 });
  // Opened from My Matches and saved on the first screen: back one entry.
  assert.deepEqual(exitPast(2, 0, "/main/matches"), { back: 1 });
});

test("an editor opened directly (no in-app history before it) goes to the fallback", () => {
  assert.deepEqual(exitPast(3, 3, "/main/matches"), { to: "/main/matches" });
  assert.deepEqual(exitPast(0, 0, "/main/matches"), { to: "/main/matches" });
});
