/** Where to go after sign-in when the user arrived on a protected link while signed
 *  out. Tab-scoped, consumed once. */
const KEY = "carezaar.returnTo";

export function rememberReturnTo(path: string) {
  try { window.sessionStorage.setItem(KEY, path); } catch { /* storage unavailable */ }
}

export function takeReturnTo(): string | null {
  try {
    const path = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    // Only same-app paths: never an absolute or protocol-relative URL.
    return path && path.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    return null;
  }
}

/** Read without consuming, for render; pair with `takeReturnTo()` after commit. */
export function peekReturnTo(): string | null {
  try {
    const path = window.sessionStorage.getItem(KEY);
    return path && path.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    return null;
  }
}
