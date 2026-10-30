import { API_BASE_URL } from "./config";
import { ApiError, RefusedWhileRenewalUnreachableError } from "./errors";
import { appLanguage } from "./language";
import { tokenStore, type SessionOwner } from "./session";
import { APP_VERSION } from "./config";
import { CONNECTION_RETRIES, RETRY_DELAYS_MS, isRetryableMethod } from "./retryPolicy";
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
  /** Defaults to true. False makes a refusal final, without renewing the sign-in. */
  renew?: boolean;
  /** Logout alone binds its dispatch/replay to the captured logical sign-in.
   *  Undefined keeps the existing policy for other actions; null binds signed-out. */
  sessionOwner?: SessionOwner;
  /** `Idempotency-Key` for one logical submission (see idempotency.ts). The same options are
   *  used when a refused request is sent again after renewing the sign-in, so the key stays. */
  idempotencyKey?: string;
}

export class SupersededSessionRequest extends Error {}

function requireOwner(options: RequestOptions) {
  if (options.sessionOwner !== undefined && !tokenStore.owns(options.sessionOwner)) {
    throw new SupersededSessionRequest();
  }
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

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** A complete answer: the status and headers, and the whole body. */
interface Received { response: Response; text: string }

/** One request, body included. Distinguishes the failures callers treat differently:
 *  - no complete answer (connection dropped or refused, offline, DNS, or the body cut off
 *    part-way) → `network`; a browser reports all of these the same way, so they can't be
 *    told apart here;
 *  - no complete answer within REQUEST_TIMEOUT_MS → `timeout`. The deadline covers the
 *    body too, like Android's 120 s call timeout, and aborting cancels the transfer;
 *  - any HTTP status, including errors → returned for `perform` to classify. */
async function timedFetch(url: string, init: RequestInit): Promise<Received> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } catch (cause) {
    if (controller.signal.aborted) throw new ApiError("timeout", "");
    throw new ApiError("network", (cause as Error)?.message ?? "");
  } finally {
    window.clearTimeout(timer);
  }
}

/** Android's `safeCall` for reads: after a transport failure, up to
 *  CONNECTION_RETRIES more attempts, RETRY_DELAYS_MS apart (500, 1,000, 1,500 ms). Any
 *  HTTP answer is final (a refusal or a validation error would only come back again), and
 *  writes are never repeated automatically. */
async function fetchWithRetry(url: string, init: RequestInit, retryable: boolean): Promise<Received> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await timedFetch(url, init);
    } catch (error) {
      const transient = error instanceof ApiError && error.kind === "network";
      if (!retryable || attempt >= CONNECTION_RETRIES || !transient) throw error;
      if (import.meta.env?.DEV) console.info(`No answer; retrying (${attempt + 1}/${CONNECTION_RETRIES})`);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

/** `renewed`: new tokens stored. `refused`: the server answered, but not with a new
 *  sign-in. `unreachable`: no answer at all, so the session may still be fine. */
type RefreshOutcome = "renewed" | "refused" | "unreachable";
let refreshInFlight: Promise<RefreshOutcome> | null = null;

/** Single-flight refresh so concurrent refusals issue one refresh, not many. */
async function refreshSession(): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async (): Promise<RefreshOutcome> => {
    const refresh = tokenStore.refreshToken;
    if (!refresh) return "refused";
    const owner = tokenStore.captureOwner();
    const replaced = () => tokenStore.refreshToken !== null && tokenStore.refreshToken !== refresh;
    const superseded = (): RefreshOutcome | null => tokenStore.refreshToken === refresh && tokenStore.owns(owner)
      ? null : replaced() ? "renewed" : "refused";
    let received: Received;
    try {
      // Only the app version: the backend requires it (422 "The version app field is
      // required." without it) and needs no other device field to renew.
      received = await fetchWithRetry(buildUrl("auth/refresh"), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${refresh}`,
          Accept: "application/json",
          "Accept-Language": appLanguage.code,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: encodeForm({ version_app: APP_VERSION }),
      }, false); // no automatic retry: a renewal that can't reach the server opens Connection Problem
    } catch {
      return superseded() ?? "unreachable";
    }
    const changed = superseded();
    if (changed) return changed;
    // The server answered. Any error, a server error (5xx) included, ends the sign-in,
    // as on Android (parity review v4.0, Q1): Connection Problem is only for a server
    // that can't be reached at all. A new sign-in that replaced these tokens meanwhile
    // is used rather than given up.
    if (!received.response.ok) return replaced() ? "renewed" : "refused";
    try {
      // A success that doesn't carry a usable session (malformed JSON, no result, missing
      // tokens) ends the sign-in, as Android does.
      const envelope = JSON.parse(received.text) as ApiEnvelope<Session>;
      const changed = superseded();
      if (changed) return changed;
      if (!envelope.result?.access_token || !envelope.result.refresh_token) return "refused";
      return tokenStore.renew(envelope.result, owner, refresh) ? "renewed" : superseded() ?? "refused";
    } catch {
      return superseded() ?? "refused";
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
  requireOwner(options);
  // The backend localises from Accept-Language and 500s on "*".
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": appLanguage.code,
  };
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
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

  const retryable = isRetryableMethod(options.method);
  const { response, text } = await fetchWithRetry(buildUrl(options.path, options.query), {
    method: options.method,
    headers,
    body,
  }, retryable);
  requireOwner(options);

  // Several write endpoints answer 204 (or 200) with an empty body instead of the
  // envelope. Reading text first also survives an HTML error page from the server. A body
  // that broke off part-way never gets here: it failed above as a connection error.
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
        {},
        (raw.meta && typeof raw.meta === "object" ? raw.meta : null) as Record<string, unknown> | null,
      );
  }
}

/** The server refused the request (401 or 403), whatever the reason it gives. */
const isRefusal = (error: unknown) => error instanceof ApiError && (error.kind === "unauthenticated" || error.kind === "forbidden");

/* ------------------------------------------------- Connection Problem window */

/** Dispatched with `detail: boolean` when the Connection Problem window opens (the
 *  sign-in had to be renewed and the server couldn't be reached) or closes. */
export const CONNECTION_PROBLEM_EVENT = "carezaar:connection-problem";

let problemOpen = false;

function setConnectionProblem(open: boolean) {
  if (problemOpen === open) return;
  problemOpen = open;
  window.dispatchEvent(new CustomEvent(CONNECTION_PROBLEM_EVENT, { detail: open }));
}

/** The Connection Problem window's Retry: one renewal attempt. Returns false while the
 *  server still can't be reached (the window stays). Otherwise the window closes: with
 *  a new sign-in the app simply carries on, and if the server refuses the sign-in the
 *  user is signed out. Nothing that failed while the window was open is sent again;
 *  each of those showed its own error (parity review v4.0, Q2). */
export async function retryRenewal(): Promise<boolean> {
  const outcome = await refreshSession();
  if (outcome === "unreachable") return false;
  if (outcome === "refused") expireSession();
  setConnectionProblem(false);
  return true;
}

/** Signing out while the window is open: there is no sign-in left to renew. */
export function clearConnectionProblem() {
  setConnectionProblem(false);
}

async function sendEnvelope<T>(options: RequestOptions): Promise<ApiEnvelope<T>> {
  const used = tokenStore.accessToken;
  try {
    return await perform<T>(options);
  } catch (error) {
    requireOwner(options);
    // As Android does: when the server refuses an action, for any reason, renew the
    // sign-in in the background and send the action once more. A refused request was
    // not carried out, so sending it again cannot duplicate it. The second answer is
    // final: no further renewal or retry.
    if (isRefusal(error) && options.auth !== false && options.renew !== false && used) {
      // Signed in again while this was on its way: just use the new sign-in.
      if (tokenStore.accessToken && tokenStore.accessToken !== used) return perform<T>(options);
      // While Connection Problem is open, nothing makes another renewal attempt of its
      // own: only the window's Retry does.
      const outcome: RefreshOutcome = problemOpen ? "unreachable" : await refreshSession();
      requireOwner(options);
      if (outcome === "unreachable") {
        // The server can't be reached to renew the sign-in: one Connection Problem window,
        // and this request fails now with the connection error. It is not held back and
        // not sent again after Retry (Q2).
        setConnectionProblem(true);
        throw new RefusedWhileRenewalUnreachableError();
      }
      if (outcome === "renewed") return perform<T>(options);
      // The server answered the renewal with an error: the sign-in has ended, so drop to
      // the signed-out routes as Android does (Q1). A sign-in that replaced this one in
      // the meantime is left alone.
      if (tokenStore.accessToken === used) expireSession();
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
