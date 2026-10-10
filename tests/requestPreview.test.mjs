import test from "node:test";
import assert from "node:assert/strict";
import { requestPreview } from "../src/ui/requestPreview.ts";

test("the preview is the introduction's first line", () => {
  const cases = [
    ["Hi", "Hi"],
    [" \n\t ", ""],
    ["", ""],
    ["Hello there.\nSecond line of intro.", "Hello there."],
    ["\n\n  First real line  \nmore", "First real line"],
    ["Line one\r\nLine two", "Line one"],
    ["First sentence. Another sentence.", "First sentence. Another sentence."],
    ["Two  spaces\tand a tab", "Two  spaces\tand a tab"],
    ["你好 👨‍👩‍👧‍👦 & <hello>\nmore", "你好 👨‍👩‍👧‍👦 & <hello>"],
    ["مرحبا، أنا مقدم رعاية\nسطر ثان", "مرحبا، أنا مقدم رعاية"],
  ];
  for (const [input, expected] of cases) assert.equal(requestPreview(input), expected, JSON.stringify(input));
});

test("a long first line is not cut in the text (the card truncates it visually)", () => {
  const long = "a".repeat(300);
  assert.equal(requestPreview(`${long}\nnext`), long);
});
