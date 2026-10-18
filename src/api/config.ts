/** Base URL recovered from the shipped Android binary. Overridable for staging via
 *  `VITE_CAREZAAR_API_BASE_URL`. */
export const API_BASE_URL: string =
  (import.meta.env?.VITE_CAREZAAR_API_BASE_URL as string | undefined) ??
  "https://new.carezaar.com/api/";

export const APP_VERSION = "1.0.0";

/** The backend only accepts `perPage` of 10, 25 or 50 (anything else is a 422);
 *  Android always sends 10. */
export const DEFAULT_PAGE_SIZE = 10;

/** Server limit for the introduction sent with a match request (422 above it). */
export const INTRODUCTION_MAX_LENGTH = 1000;

/** The Terms of Use and the Privacy Policy opened from Create Account, as supplied by the
 *  client (17 October 2026). `content` is the document's text, converted from the PDF and
 *  checked character for character against it (shown in the app); `pdf` is the original. */
export const LEGAL_DOCUMENTS: Record<"terms" | "privacy", { content: string; pdf: string }> = {
  terms: { content: "/legal/terms-of-use.json", pdf: "/legal/terms-of-use.pdf" },
  privacy: { content: "/legal/privacy-policy.json", pdf: "/legal/privacy-policy.pdf" },
};
