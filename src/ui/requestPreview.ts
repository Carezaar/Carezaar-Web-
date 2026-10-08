export function requestPreview(message: string): string {
  const text = message.replace(/\s+/gu, " ").trim();
  if (!text) return "";
  const firstSentence = text.match(/^.*?[.!?](?:\s|$)/u)?.[0].trim();
  const beginning = firstSentence && firstSentence.length < text.length
    ? firstSentence.replace(/[.!?]+$/u, "") : text;
  // Count graphemes, so an emoji family or an accented character stays intact.
  const letters = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(beginning), (s) => s.segment);
  const clipped = letters.length > 80 || beginning !== text;
  return letters.slice(0, 80).join("").trimEnd() + (clipped ? "..." : "");
}
