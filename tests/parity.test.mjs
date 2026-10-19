// Pure rules behind the parity review v4.0 corrections: Create Account's checks (C2),
// pay rates (F4) and deleted accounts (K3).
import test from "node:test";
import assert from "node:assert/strict";
import { parsePay, signUpErrors } from "../src/validation/validation.ts";
import { isDeletedAccount, personName } from "../src/app/names.ts";

// Managed texts as the server returns them in English (base/contents, 2026-10-17).
const TEXTS = {
  general_required: "This field is required.",
  signup_credentials_email_invalid: "Please enter a valid email address.",
  signup_credentials_password_match: "Passwords do not match.",
  signup_credentials_accept_required: "Please accept the license agreement to continue.",
  signup_credentials_password_validation_8_letters: "8 letters",
  signup_credentials_password_validation_1_lowercase: "One lowercase",
  signup_credentials_password_validation_1_uppercase: "One uppercase",
  signup_credentials_password_validation_1_number: "One number",
  signup_credentials_password_validation_1_special_symbol: "One special symbol",
  general_deleted_account: "Deleted Account",
};
const t = (slug, fallback) => TEXTS[slug] ?? fallback;

test("Web v5 C2: empty fields take priority over agreement", () => {
  assert.deepEqual(signUpErrors({ email: "", password: "", confirmation: "", accepted: false }, t), {
    email: "This field is required.",
    password: "This field is required.",
    confirmation: "This field is required.",
    accepted: undefined,
  });
});

test("C2: managed wording for an invalid email, the first unmet password rule, a mismatch", () => {
  const e = signUpErrors({ email: "not-an-email", password: "abcdefgh", confirmation: "abcdefgx", accepted: true }, t);
  assert.equal(e.email, "Please enter a valid email address.");
  assert.equal(e.password, "One uppercase");
  assert.equal(e.confirmation, "Passwords do not match.");
  assert.equal(e.accepted, undefined);
  assert.equal(signUpErrors({ email: "a@b.co", password: "Ab1!", confirmation: "Ab1!", accepted: true }, t).password, "8 letters");
  assert.equal(signUpErrors({ email: "a@b.co", password: "Abcdefg1", confirmation: "Abcdefg1", accepted: true }, t).password, "One special symbol");
});

test("C2: a valid form has no problems", () => {
  const e = signUpErrors({ email: " person@example.com ", password: "Abcdef1!", confirmation: "Abcdef1!", accepted: true }, t);
  assert.ok(Object.values(e).every((v) => v === undefined));
});

test("F4: pay rates keep digits only, at most 6, never rounded", () => {
  assert.equal(parsePay(""), null);
  assert.equal(parsePay("25"), 25);
  assert.equal(parsePay("12.5"), 125);
  assert.equal(parsePay("-30"), 30);
  assert.equal(parsePay("1234567"), 123456);
  assert.equal(parsePay("12a3456789"), 123456);
  assert.equal(parsePay("abc"), null);
});

test("K3: a deleted account is named \"Deleted Account\"; others by their name", () => {
  const deleted = { first_name: null, last_name: null, is_deleted: true };
  assert.equal(isDeletedAccount(deleted), true);
  assert.equal(personName(deleted, t), "Deleted Account");
  assert.equal(personName({ first_name: "Nora", last_name: "PV QA", is_deleted: false }, t), "Nora PV QA");
  assert.equal(personName({ first_name: "Nora", last_name: null }, t), "Nora");
  assert.equal(personName(null, t), "");
});

test("C3: the client's Terms of Use and Privacy Policy are bundled, with their PDFs", async () => {
  const { readFileSync, statSync } = await import("node:fs");
  const doc = (name) => JSON.parse(readFileSync(new URL(`../public/legal/${name}.json`, import.meta.url), "utf8"));
  const text = (d) => d.blocks.map((b) => b.r.map((r) => r[0]).join("")).join("\n");
  const terms = doc("terms-of-use"), privacy = doc("privacy-policy");
  assert.equal(terms.title, "Terms of Use");
  assert.equal(privacy.title, "Privacy Policy");
  assert.ok(terms.blocks.some((b) => b.t === "h" && text({ blocks: [b] }) === "1. Introduction and Acceptance of Terms"));
  assert.ok(privacy.blocks.some((b) => b.t === "h" && text({ blocks: [b] }) === "2. How We Collect Information"));
  assert.ok(text(terms).length > 50000 && text(privacy).length > 11000);
  for (const name of ["terms-of-use", "privacy-policy"]) {
    assert.ok(statSync(new URL(`../public/legal/${name}.pdf`, import.meta.url)).size > 100000, `${name}.pdf`);
  }
});

 test("Web v5 C2: valid fields require agreement as the final gate", () => {
 const e = signUpErrors({email:"test@example.com",password:"Abcdef1!",confirmation:"Abcdef1!",accepted:false},t);
 assert.equal(e.accepted,"Please accept the license agreement to continue.");
 assert.equal(e.email,undefined); assert.equal(e.password,undefined); assert.equal(e.confirmation,undefined);
 });
