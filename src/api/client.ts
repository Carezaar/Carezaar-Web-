import { API_BASE_URL } from "./config";
import { ApiError } from "./errors";
import { appLanguage } from "./language";
import { tokenStore } from "./session";
import { APP_VERSION } from "./config";
import type { ApiEnvelope, ApiMeta, Session } from "./types";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** A form field value. Multi-select ids go over the wire as a comma-joined string
 *  (`"1,4,9"`) — the encoding the Android client uses for every `*_ids` parameter. */
export type FormValue = string | number | boolean | number[] | null | undefined;

export interface RequestOptions {
  method: Method;
  /** Path relative to the API base, e.g. `users/matches/12/accept`. */
  path: string;
  query?: Record<string, string | number | null | undefined>;
  /** Sent as `application/x-www-form-urlencoded`, like every Android write. */
  form?: Record<string, FormValue>;
  /** Sent as `multipart/form-data` — only `users/profile` uses this. */
  multipart?: FormData;
  /** Defaults to true. */
  auth?: boolean;
  /** POST requests are not repeated after a dropped connection unless they are safe to
   *  send twice (signing in, re-saving the same profile). GET, PUT, PATCH and DELETE
   *  are. Sending a message or reporting an issue is not. */
  idempotent?: boolean;
  /** Defaults to true. False makes a refusal final, without renewing the sign-in: used
   *  for the request that replaces the session itself (a password change). */
  renew?: boolean;
}

/** Dispatched when the session cannot be recovered, so the app can drop back to the
 *  unauthenticated routes the way Android does. */
export const SESSION_EXPIRED_EVENT = "carezaar:session-expired";

function encodeForm(fields: Record<string, FormValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue; // Retrofit omits null @Field
    params.append(
      key,
      Array.isArray(value) ? value.join(",") : String(value),
    );
  }
  return params.toString();
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path.replace(/^\//, ""), API_BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Android's OkHttp timeouts are all 120 s. A fast answer still returns at once; this
 *  only bounds how long a silent server is waited for. */
export const REQUEST_TIMEOUT_MS = 120_000;
/** Attempts after the first when the connection drops (no response at all). */
export const CONNECTION_RETRIES = 3;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** One request. Distinguishes the failures callers treat differently:
 *  - no response at all (connection dropped, offline, DNS) → `network`;
 *  - no response within REQUEST_TIMEOUT_MS → `timeout`;
 *  - any HTTP status, including errors → returned for `perform` to classify. */
async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (cause) {
    if (controller.signal.aborted) throw new ApiError("timeout", "");
    throw new ApiError("network", (cause as Error)?.message ?? "");
  } finally {
    window.clearTimeout(timer);
  }
}

/** Repeats a request up to CONNECTION_RETRIES times, 1 s, 2 s then 4 s apart, but only
 *  when the connection dropped and only for requests safe to send twice. A timeout is
 *  not repeated (the server may still be working on it), and neither is any HTTP
 *  answer: a refusal or a validation error would only come back again. */
async function fetchWithRetry(url: string, init: RequestInit, retryable: boolean): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await timedFetch(url, init);
    } catch (error) {
      if (!retryable || attempt >= CONNECTION_RETRIES || !(error instanceof ApiError) || error.kind !== "network") throw error;
      if (import.meta.env?.DEV) console.info(`Connection dropped; retrying (${attempt + 1}/${CONNECTION_RETRIES})`);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

/** `renewed`: new tokens stored. `refused`: the server will not renew this sign-in.
 *  `unreachable`: no answer, so the session may still be fine. */
type RefreshOutcome = "renewed" | "refused" | "unreachable";
let refreshInFlight: Promise<RefreshOutcome> | null = null;

/** Single-flight refresh so concurrent refusals issue one refresh, not many. */
async function refreshSession(): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async (): Promise<RefreshOutcome> => {
    const refresh = tokenStore.refreshToken;
    if (!refresh) return "refused";
    const replaced = () => tokenStore.refreshToken !== null && tokenStore.refreshToken !== refresh;
    try {
      // Only the app version: the backend requires it (422 "The version app field is
      // required." without it) and needs no other device field to renew.
      const response = await fetchWithRetry(buildUrl("auth/refresh"), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${refresh}`,
          Accept: "application/json",
          "Accept-Language": appLanguage.code,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: encodeForm({ version_app: APP_VERSION }),
      }, true);
      // A new sign-in replaced these tokens meanwhile: use it rather than give up.
      if (!response.ok) return replaced() ? "renewed" : response.status >= 500 ? "unreachable" : "refused";
      const envelope = (await response.json()) as ApiEnvelope<Session>;
      if (!envelope.result?.access_token || !envelope.result.refresh_token) return "refused";
      tokenStore.save(envelope.result);
      return "renewed";
    } catch {
      return "unreachable";
    }
  })();
  const result = await refreshInFlight;
  refreshInFlight = null;
  return result;
}

function expireSession() {
  tokenStore.clear();
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

async function perform<T>(options: RequestOptions): Promise<ApiEnvelope<T>> {
  // The backend localises from Accept-Language and 500s on "*".
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": appLanguage.code,
  };
  const useAuth = options.auth !== false;
  if (useAuth && tokenStore.accessToken) {
    headers.Authorization = `Bearer ${tokenStore.accessToken}`;
  }

  let body: BodyInit | undefined;
  if (options.multipart) {
    body = options.multipart; // browser sets the boundary
  } else if (options.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
    body = encodeForm(options.form);
  }

  const retryable = options.method !== "POST" || options.idempotent === true;
  const response = await fetchWithRetry(buildUrl(options.path, options.query), {
    method: options.method,
    headers,
    body,
  }, retryable);

  // Several write endpoints answer 204 (or 200) with an empty body instead of the
  // envelope. Reading text first also survives an HTML error page from the server.
  let text = "";
  try { text = await response.text(); } catch { /* treated as empty */ }
  if (response.ok && text.trim() === "") {
    return { result: null, meta: null, message: null, errors: null };
  }

  let envelope: ApiEnvelope<T> | null = null;
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
    envelope = raw as unknown as ApiEnvelope<T>;
  } catch {
    envelope = null;
  }
  const message = (envelope?.message ?? (raw.message as string) ?? "") || "";

  if (response.ok) {
    if (!envelope) throw new ApiError("decoding", "", response.status);
    return envelope;
  }

  // 403 means two things on this backend: a missing, invalid or expired token (no field
  // errors, e.g. "Token is invalid!"), or the caller not being allowed to touch a record,
  // which names the field (e.g. withdrawing a request that isn't theirs: {"id": [...]}).
  // Only the first is a session problem.
  const fieldErrors = (envelope?.errors ?? raw.errors) as Record<string, string[]> | null | undefined;
  if (response.status === 403 && fieldErrors && Object.keys(fieldErrors).length > 0) {
    throw new ApiError("forbidden", message, response.status, fieldErrors);
  }

  switch (response.status) {
    case 401:
    case 403:
      throw new ApiError("unauthenticated", message, response.status);
    case 404:
      throw new ApiError("notFound", message, response.status);
    case 422:
      throw new ApiError(
        "validation",
        message,
        response.status,
        (envelope?.errors ?? (raw.errors as Record<string, string[]>) ?? {}),
      );
    default:
      throw new ApiError(
        response.status >= 500 ? "server" : "unknown",
        message,
        response.status,
      );
  }
}

/** The server refused the request (401 or 403), whatever the reason it gives. */
const isRefusal = (error: unknown) => error instanceof ApiError && (error.kind === "unauthenticated" || error.kind === "forbidden");

/** Replaces the session (e.g. signing in again after a password change, which ends
 *  every session of the account). While `work` runs, any request the server refuses
 *  waits for it and is then sent once more with the new sign-in, instead of trying to
 *  renew the old one and signing the user out. */
export async function replaceSession(work: () => Promise<void>): Promise<void> {
  while (refreshInFlight) await refreshInFlight.catch(() => undefined);
  let failure: unknown = null;
  const switching = (async (): Promise<RefreshOutcome> => {
    try { await work(); } catch (error) { failure = error; }
    // Whatever happened, waiting requests try once more with the tokens now stored.
    return "renewed";
  })();
  refreshInFlight = switching;
  try {
    await switching;
  } finally {
    if (refreshInFlight === switching) refreshInFlight = null;
  }
  if (failure) throw failure;
}

async function sendEnvelope<T>(options: RequestOptions): Promise<ApiEnvelope<T>> {
  const used = tokenStore.accessToken;
  try {
    return await perform<T>(options);
  } catch (error) {
    // As Android does: when the server refuses an action, for any reason, renew the
    // sign-in in the background and send the action once more. A refused request was
    // not carried out, so sending it again cannot duplicate it. The second answer is
    // final: no further renewal or retry.
    if (isRefusal(error) && options.auth !== false && options.renew !== false && used) {
      // Signed in again while this was on its way: just use the new sign-in.
      if (tokenStore.accessToken && tokenStore.accessToken !== used) return perform<T>(options);
      const outcome = await refreshSession();
      if (outcome === "renewed") return perform<T>(options);
      // The sign-in itself can't be renewed: drop to the signed-out routes rather than
      // leave a shell that looks signed in while every call fails. When the server
      // couldn't be reached, the session is kept and the refusal reported. A sign-in
      // that replaced this one in the meantime is left alone.
      if (outcome === "refused" && tokenStore.accessToken === used) expireSession();
    }
    throw error;
  }
}

export const api = {
  /** Sends a request and unwraps the envelope's `result`. */
  async send<T>(options: RequestOptions): Promise<T> {
    const envelope = await sendEnvelope<T>(options);
    if (envelope.result === null || envelope.result === undefined) {
      throw new ApiError("decoding", `No result for ${options.path}.`);
    }
    return envelope.result;
  },

  /** For endpoints that may answer with or without a result (e.g. 204). */
  async sendOptional<T>(options: RequestOptions): Promise<T | null> {
    const envelope = await sendEnvelope<T>(options);
    return envelope.result ?? null;
  },

  /** For endpoints whose result is empty or ignored. */
  async sendIgnoringResult(options: RequestOptions): Promise<string | null> {
    const envelope = await sendEnvelope<unknown>(options);
    return envelope.message;
  },

  /** Returns the result plus `meta`, for paged lists. */
  async sendPaged<T>(options: RequestOptions): Promise<{ result: T; meta: ApiMeta | null }> {
    const envelope = await sendEnvelope<T>(options);
    if (envelope.result === null || envelope.result === undefined) {
      throw new ApiError("decoding", `No result for ${options.path}.`);
    }
    return { result: envelope.result, meta: envelope.meta };
  },
};
