import { API_BASE_URL } from "./config";
import { ApiError } from "./errors";
import { appLanguage } from "./language";
import { loginDeviceFields, tokenStore } from "./session";
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

/** Bounded like Android's OkHttp client, so no screen can wait forever. */
export const REQUEST_TIMEOUT_MS = 60_000;

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

let refreshInFlight: Promise<boolean> | null = null;

/** Single-flight refresh so concurrent 403s issue one refresh, not many. */
async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refresh = tokenStore.refreshToken;
    if (!refresh) return false;
    try {
      // The live backend rejects a refresh without the login device fields (422 "The
      // version app field is required."), although the Android client sends none.
      const response = await timedFetch(buildUrl("auth/refresh"), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${refresh}`,
          Accept: "application/json",
          "Accept-Language": appLanguage.code,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: encodeForm(loginDeviceFields()),
      });
      if (!response.ok) return false;
      const envelope = (await response.json()) as ApiEnvelope<Session>;
      if (!envelope.result) return false;
      tokenStore.save(envelope.result);
      return true;
    } catch {
      return false;
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

  const response = await timedFetch(buildUrl(options.path, options.query), {
    method: options.method,
    headers,
    body,
  });

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

async function sendEnvelope<T>(options: RequestOptions): Promise<ApiEnvelope<T>> {
  try {
    return await perform<T>(options);
  } catch (error) {
    // The backend answers 403 — not 401 — for an absent or expired token, so that
    // is the case that has to trigger refresh.
    if (error instanceof ApiError && error.kind === "unauthenticated" && options.auth !== false
        && tokenStore.accessToken) {
      if (tokenStore.refreshToken && await refreshSession()) return perform<T>(options);
      // No way to recover: drop to the signed-out routes rather than leave a shell
      // that looks signed in while every call fails.
      expireSession();
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
