import test from "node:test";
import assert from "node:assert/strict";
import { appLanguage, documentLanguageTag } from "../src/api/language.ts";

test("HTML identifies Spanish, Hindi and Chinese using standard language tags", () => {
  assert.equal(documentLanguageTag("sp"), "es");
  assert.equal(documentLanguageTag("in"), "hi");
  assert.equal(documentLanguageTag("cn"), "zh");
});

test("standard managed language codes remain unchanged", () => {
  for (const code of ["en", "fr", "ru", "ar", "fa"]) {
    assert.equal(documentLanguageTag(code), code);
  }
});

test("choosing a language keeps the legacy backend code and managed language ID", () => {
  const previousWindow = globalThis.window;
  const stored = new Map();
  globalThis.window = { localStorage: {
    setItem: (key, value) => stored.set(key, value),
    getItem: (key) => stored.get(key) ?? null,
  } };
  try {
    appLanguage.select({ id: 7, code: "in" });
    assert.equal(appLanguage.code, "in");
    assert.equal(appLanguage.id, 7);
    assert.equal(documentLanguageTag(appLanguage.code), "hi");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
