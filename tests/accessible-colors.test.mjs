import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { textColor, withFieldOutlines } from "../src/design/accessibleColors.ts";

// WCAG 2.x relative luminance and contrast ratio.
const lum = (hex) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgb = (hex, a = 1) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).concat(a);

const css = fs.readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
const token = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))[1].toUpperCase();

test("frame text colours below AA render as the app's AA tokens; others are unchanged", () => {
  assert.equal(textColor(rgb("#FF0000")), "#c81e2a");
  assert.equal(textColor(rgb("#01BB8A")), "#017a5a");
  assert.equal(textColor(rgb("#7F7F7F")), "#666666");
  assert.equal(textColor(rgb("#006EE6")), "rgba(0,110,230,1)");
  assert.equal(textColor(rgb("#FF0000", 0.5)), "rgba(255,0,0,0.5)", "translucent paints are left alone");
  for (const [mapped] of [["#C81E2A"], ["#017A5A"], ["#666666"]]) assert.ok(ratio(mapped, "#FFFFFF") >= 4.5, mapped);
});

const node = (name, x, y, w, h, extra = {}) => ({ id: name, name, x, y, width: w, height: h, fills: [], strokes: [], children: [], ...extra });
const grey = [{ type: "solid", color: rgb("#CFCFCF") }];

test("a #CFCFCF outline around a text input becomes the field border; decorative strokes stay", () => {
  const field = node("Text Field", 20, 100, 300, 56, { children: [
    node("Background", 0, 0, 300, 56, { strokes: grey }),
    node("Content", 10, 8, 280, 40, { children: [node("Input", 4, 4, 260, 32, { inputType: "email" })] }),
  ] });
  const chip = node("Password Condition", 20, 200, 60, 30, { children: [node("Background", 0, 0, 60, 30, { strokes: grey })] });
  const overlayRect = node("Rectangle 2", 60, 300, 300, 60, { strokes: grey });
  const scene = node("Frame", 0, 0, 400, 800, { children: [field, chip, overlayRect] });
  const out = withFieldOutlines(scene, [{ x: 68, y: 302, w: 278, h: 56 }]);
  const stroke = (n) => n.strokes[0].color.slice(0, 3).map((v) => Math.round(v * 255));
  assert.deepEqual(stroke(out.children[0].children[0]), [0x80, 0x86, 0x8f], "frame field outline");
  assert.deepEqual(stroke(out.children[2]), [0x80, 0x86, 0x8f], "outline around an overlaid input");
  assert.deepEqual(stroke(out.children[1].children[0]), [0xcf, 0xcf, 0xcf], "password-rule chip keeps its stroke");
  assert.deepEqual(scene.children[0].children[0].strokes[0].color, rgb("#CFCFCF"), "the scene itself is not mutated");
});

test("colour tokens meet WCAG AA where they are used, and the brand blue is kept", () => {
  assert.ok(ratio(token("field-border"), "#FFFFFF") >= 3, "field outline on white (1.4.11)");
  assert.ok(ratio(token("field-border"), "#EDF4FC") >= 3, "field outline on the pale panels");
  assert.ok(ratio(token("field-border"), "#F0F2F5") >= 3, "field outline on the grey composer");
  assert.ok(ratio(token("warning-text"), "#FFFFFF") >= 4.5, "Pending Acceptance on white");
  assert.ok(ratio(token("warning-text"), "#FFF7E6") >= 4.5, "status pill text on its fill");
  assert.ok(ratio("#FFFFFF", token("primary")) >= 4.5, "white labels on filled buttons and the selected segment");
  assert.ok(ratio(token("primary"), "#FFFFFF") >= 4.5, "blue links on white");
  assert.ok(ratio(token("text-secondary"), "#EAF2FC") >= 4.5, "composer placeholder on its fill");
  assert.ok(ratio(token("error"), "#FFFFFF") >= 4.5 && ratio(token("success-text"), "#FFFFFF") >= 4.5);
  assert.match(css, /\.segmented button\.on \{ background: var\(--primary\); color: #fff;/);
  assert.match(css, /\.pending-note \{ color: var\(--warning-text\);/);
  const brand = fs.readFileSync(new URL("../src/design/tokens.ts", import.meta.url), "utf8");
  assert.match(brand, /primary: "#007AFE"/, "the official brand blue stays the design token");
  assert.match(fs.readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"), /"theme_color": "#007afe"/);
});

test("the pay section is headed by the client's labels, per role, through managed texts", () => {
  const wizard = fs.readFileSync(new URL("../src/screens/wizard.tsx", import.meta.url), "utf8");
  const client = wizard.slice(wizard.indexOf("export function ClientPreferencesWizard"), wizard.indexOf("export function CaregiverSkillsWizard"));
  const caregiver = wizard.slice(wizard.indexOf("export function CaregiverSkillsWizard"));
  assert.ok(client.includes('<SalaryRange title={t("signup_form_client_hourly_budget", "Hourly Care Budget")}'));
  assert.ok(client.includes('t("signup_form_client_hourly_budget", "Hourly Care Budget")} ('), "client review row");
  assert.ok(caregiver.includes('<SalaryRange title={t("signup_form_caregiver_expected_hourly_pay", "Expected Hourly pay")}'));
  assert.ok(caregiver.includes('t("signup_form_caregiver_expected_hourly_pay", "Expected Hourly pay")} ('), "caregiver review row");
  assert.ok(client.includes('note={t("signup_form_client_hourly_budget_hint", "Enter the hourly amount you are willing to pay for care services.")}'), "client hint, as in the client's screenshot");
  assert.ok(caregiver.includes('note={t("signup_form_caregiver_expected_hourly_pay_hint", "Enter your expected hourly pay rate.")}'), "caregiver hint");
  assert.ok(!client.includes("signup_form_caregiver_expected_hourly_pay") && !caregiver.includes("signup_form_client_hourly_budget"), "no cross-role label");
});
