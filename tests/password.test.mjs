import test from "node:test";
import assert from "node:assert/strict";
import { hasSpecialCharacter, isPasswordValid, passwordRules, PASSWORD_SPECIAL_CHARACTERS } from "../src/validation/validation.ts";

const ALLOWED = [..."!@#$%^&*()_+[]{}|-;:,.<>?"];
const special = (p) => passwordRules(p).find((r) => r.id === "1_special_symbol").satisfied;
const failing = (p) => passwordRules(p).filter((r) => !r.satisfied).map((r) => r.id);

test("the special set is exactly the client's list", () => {
  assert.equal(PASSWORD_SPECIAL_CHARACTERS, "!@#$%^&*()_+[]{}|-;:,.<>?");
  assert.equal(ALLOWED.length, 25);
});

test("every allowed symbol counts, alone and inside a full password", () => {
  for (const c of ALLOWED) {
    assert.equal(hasSpecialCharacter(c), true, `"${c}" alone`);
    assert.equal(isPasswordValid(`Abcdefg1${c}`), true, `"${c}" at the end`);
    assert.equal(isPasswordValid(`${c}Abcdefg1`), true, `"${c}" at the start`);
  }
});

test("symbols outside the list do not count", () => {
  for (const c of ["~", "`", "=", "/", "\\", "'", '"', " ", "€", "£", "§", "¿", "¡", "é", "😀", "\t", "\n"]) {
    assert.equal(special(`Abcdefg1${c}`), false, JSON.stringify(c));
    assert.equal(isPasswordValid(`Abcdefg1${c}`), false, JSON.stringify(c));
  }
});

test("regex metacharacters are taken literally", () => {
  assert.equal(special("Abcdefg1\\d"), false);
  assert.equal(special("Abcdefg1.*"), true);
  assert.equal(special("Abcdefg1[a-z]"), true);
});

test("the other rules are unchanged", () => {
  assert.deepEqual(failing("Abcdefg12"), ["1_special_symbol"], "letters and numbers only");
  assert.deepEqual(failing("Abcdef1!"), [], "minimum length with one allowed symbol");
  assert.deepEqual(failing("Abcde1!"), ["8_letters"], "one short of the minimum");
  assert.deepEqual(failing("Ab1!@#$%"), [], "several allowed symbols");
  assert.deepEqual(failing("Abcdefg1~"), ["1_special_symbol"], "an unsupported symbol");
  assert.deepEqual(failing("abc~"), ["8_letters", "1_uppercase", "1_number", "1_special_symbol"], "fails several rules");
  assert.deepEqual(failing(""), ["8_letters", "1_lowercase", "1_uppercase", "1_number", "1_special_symbol"]);
});
