/** Dates and times are shown exactly as the server stores them (client requirement,
 *  October 2026), for every visitor whatever their time zone: no parsing, so a value
 *  without a zone marker is never read as local time and nothing is converted. The
 *  server sends pre-formatted UTC strings ("2026-10-10 10:13:59", "10:13 10/10"); a
 *  value with an explicit offset ("…Z", "…+02:00") is shown as written too. A missing
 *  or non-text value shows nothing. */
export function asStored(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
