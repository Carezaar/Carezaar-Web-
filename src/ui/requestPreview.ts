/** The preview on a request card: the introduction's first line with text, as on
 *  Android. Spacing inside the line is kept; the card truncates it visually (CSS
 *  ellipsis), and the full text is in the introduction window. */
export function requestPreview(message: string): string {
  return message.split(/\r\n|\r|\n/u).map((line) => line.trim()).find((line) => line !== "") ?? "";
}
