/** Only requests that read are repeated after a dropped connection (client requirement,
 *  October 2026). Anything that changes data (saving, accepting, sending, favouriting,
 *  signing in, changing a password…) may already have reached the server when the
 *  connection dropped, so it is never sent again automatically. */
export const isRetryableMethod = (method: string) => method === "GET";

/** Android's `safeCall`: after a transport failure, up to three more attempts, waiting
 *  (attempt + 1) × 500 ms first — 500, 1,000 then 1,500 ms. */
export const CONNECTION_RETRIES = 3;
export const RETRY_DELAYS_MS = [500, 1_000, 1_500];
