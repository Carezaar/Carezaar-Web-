import type { Session } from "./types";
import { APP_VERSION } from "./config";

/** Token storage. The web equivalent of the iOS Keychain: the session must survive
 *  reload so the splash route can decide where to send the user, exactly as the
 *  Android app does. */
const ACCESS = "carezaar.accessToken";
const REFRESH = "carezaar.refreshToken";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) — the session lives for this tab only */
  }
}

export const tokenStore = {
  get accessToken() {
    return read(ACCESS);
  },
  get refreshToken() {
    return read(REFRESH);
  },
  get hasSession() {
    return read(ACCESS) !== null;
  },
  save(session: Session) {
    write(ACCESS, session.access_token);
    write(REFRESH, session.refresh_token);
  },
  clear() {
    try {
      window.localStorage.removeItem(ACCESS);
      window.localStorage.removeItem(REFRESH);
    } catch {
      /* ignore */
    }
  },
};

/** Device telemetry for `auth/login`. `os` and `version_os` are required by the
 *  backend (an empty value is rejected with 422 "The version os field is required."),
 *  so they are always filled; Android sends the SDK level. Optional fields are
 *  omitted when unknown rather than sent empty. */
export function loginDeviceFields(): Record<string, string> {
  const ua = navigator.userAgent;
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  const browserVersion = ua.match(/(?:Edg|OPR|Chrome|Firefox|Version)\/(\d+(?:\.\d+)?)/)?.[1];
  const os: [string, string | undefined] =
    /Windows NT/.test(ua) ? ["Windows", ua.match(/Windows NT ([\d.]+)/)?.[1]]
    : /Android/.test(ua) ? ["Android", ua.match(/Android ([\d.]+)/)?.[1]]
    : /(iPhone|iPad|iPod)/.test(ua) ? ["iOS", ua.match(/OS (\d+[_\d]*)/)?.[1]?.replace(/_/g, ".")]
    : /Mac OS X/.test(ua) ? ["macOS", ua.match(/Mac OS X (\d+[_.\d]*)/)?.[1]?.replace(/_/g, ".")]
    : /Linux/.test(ua) ? ["Linux", undefined]
    : ["Web", undefined];

  const fields: Record<string, string> = {
    version_app: APP_VERSION,
    os: os[0],
    version_os: os[1] || "0",
    browser,
  };
  if (browserVersion) fields.version_browser = browserVersion;
  return fields;
}
