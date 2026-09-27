/** The API pre-formats timestamps in UTC without saying so ("2026-09-25 02:16:52",
 *  "2:22 09/25"). Android prints them as they come, so a user sees UTC; show the
 *  viewer's local time instead, in the same format. Other strings pass through. */
const pad = (n: number) => String(n).padStart(2, "0");

export function localTime(value: string | null | undefined, now = new Date()): string {
  if (!value) return "";
  let m = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  m = value.match(/^(\d{1,2}):(\d{2}) (\d{2})\/(\d{2})$/);
  if (m) {
    // No year: take the current one, or last year if that lands in the future.
    let d = new Date(Date.UTC(now.getUTCFullYear(), +m[3] - 1, +m[4], +m[1], +m[2]));
    if (d.getTime() - now.getTime() > 86_400_000) d = new Date(Date.UTC(now.getUTCFullYear() - 1, +m[3] - 1, +m[4], +m[1], +m[2]));
    return `${d.getHours()}:${pad(d.getMinutes())} ${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  }
  return value;
}
