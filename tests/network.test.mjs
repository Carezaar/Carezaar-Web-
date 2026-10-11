import test from "node:test";
import assert from "node:assert/strict";
import { isRetryableMethod, CONNECTION_RETRIES } from "../src/api/retryPolicy.ts";
import { asStored } from "../src/app/serverTime.ts";

test("only reads are retried after a dropped connection", () => {
  assert.equal(isRetryableMethod("GET"), true);
  for (const m of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(isRetryableMethod(m), false, m);
  assert.equal(CONNECTION_RETRIES, 3);
});

test("dates are shown exactly as the server stores them, in any time zone", () => {
  const cases = ["2026-10-10 10:13:59", "10:13 10/10", "2026-10-10T23:59:59Z", "2026-10-11T00:30:00+05:30", "2026-12-31 23:59:59"];
  for (const tz of ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Kiritimati"]) {
    process.env.TZ = tz;
    for (const v of cases) assert.equal(asStored(v), v, `${tz} ${v}`);
  }
  assert.equal(asStored(null), "");
  assert.equal(asStored(undefined), "");
  assert.equal(asStored(1791627134), "");
  assert.equal(asStored("  2026-10-10 10:13:59 "), "2026-10-10 10:13:59");
});
