/** Only requests that read are repeated after a dropped connection (client requirement,
 *  October 2026). Anything that changes data (saving, accepting, sending, favouriting,
 *  signing in, changing a password…) may already have reached the server when the
 *  connection dropped, so it is never sent again automatically. */
export const isRetryableMethod = (method: string) => method === "GET";

/** Attempts after the first when a read's connection drops, and the waits between them. */
export const CONNECTION_RETRIES = 3;
export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
