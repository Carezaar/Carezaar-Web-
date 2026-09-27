/** The backend localises every response from the `Accept-Language` header and
 *  **rejects `*` with a 500** (`Invalid "*" locale.`), so a concrete locale must be
 *  sent on every request. Android does this in an OkHttp interceptor using the
 *  language chosen on `ChangeLanguage`; this is the web equivalent.
 *
 *  Note this cannot be left to the browser: `fetch` does not let page script set
 *  `Accept-Language` implicitly, and some runtimes default it to `*`. */
const CODE_KEY = "carezaar.languageCode";
const ID_KEY = "carezaar.languageId";

export const appLanguage = {
  get code(): string {
    try {
      return window.localStorage.getItem(CODE_KEY) ?? "en";
    } catch {
      return "en";
    }
  },
  /** `Language.id`, used to pick the right `translations` entry for labels. */
  get id(): number {
    try {
      return Number(window.localStorage.getItem(ID_KEY)) || 1;
    } catch {
      return 1;
    }
  },
  select(language: { code: string; id: number }) {
    try {
      window.localStorage.setItem(CODE_KEY, language.code);
      window.localStorage.setItem(ID_KEY, String(language.id));
    } catch {
      /* storage unavailable — defaults apply for this session */
    }
  },
};
