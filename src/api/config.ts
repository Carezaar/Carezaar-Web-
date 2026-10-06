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
