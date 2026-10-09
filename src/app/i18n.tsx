import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { appLanguage } from "../api/language";
import type { BaseItem, Language } from "../api/types";

/** All UI copy is server-driven: `base/contents` returns ~500 slugs translated per
 *  language. There is no bundled string catalogue, exactly as on Android. */
export const ENGLISH_ID = 1;

interface I18nValue {
  languageId: number;
  languageCode: string;
  isRtl: boolean;
  languages: Language[];
  /** Copy for a slug in the current language, else English, else the fallback. */
  t: (slug: string, fallback?: string) => string;
  /** Translation of English text baked into a Figma scene, or null. */
  translateEnglish: (english: string) => string | null;
  /** Localised label of a lookup-table row. */
  label: (item: BaseItem | undefined) => string;
  setLanguage: (language: Language) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

// The API still labels match_withdraw_title "Cancel". The new profile action is
// Withdraw; use translated fallback copy until the CMS supplies its new key.
const CLIENT_CONTENT: Record<string, Record<string, string>> = {
  match_withdraw_button: {
    en: "Withdraw", sp: "Retirar", fr: "Retirer", ru: "Отозвать",
    ar: "سحب الطلب", fa: "پس گرفتن درخواست", in: "अनुरोध वापस लें", cn: "撤回请求",
  },
};

function normalise(text: string): string {
  return text.replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u2028\u00a0\n]/g, " ").replace(/\s+/g, " ").trim()
    // Design copy and server copy differ only in closing punctuation in places.
    .replace(/[.…!:]+$/u, "").trim().toLowerCase();
}

/** Server content rows known to hold the wrong language. Applied only while the
 *  server still returns exactly the bad text, so a CMS fix takes over automatically. */
const CONTENT_FIXES: { slug: string; languageId: number; bad: string; good: string }[] = [
  { slug: "signup_credentials_confirm_password_placeholder", languageId: 3, bad: "Confirmez votre mot de passe...", good: "أكد كلمة المرور الخاصة بك..." },
  { slug: "signup_setup_password_confirm_password_placeholder", languageId: 3, bad: "Confirmez votre mot de passe...", good: "أكد كلمة المرور الخاصة بك..." },
];

function corrected(slug: string, languageId: number, text: string | undefined): string | undefined {
  const fix = CONTENT_FIXES.find((f) => f.slug === slug && f.languageId === languageId && f.bad === text);
  return fix ? fix.good : text;
}

export function I18nProvider({
  contents, languages, children,
}: {
  contents: BaseItem[];
  languages: Language[];
  children: ReactNode;
}) {
  const [languageId, setLanguageId] = useState(appLanguage.id);
  const [languageCode, setLanguageCode] = useState(appLanguage.code);

  const { bySlug, slugByEnglish } = useMemo(() => {
    const bySlug = new Map<string, BaseItem>();
    const slugByEnglish = new Map<string, string>();
    for (const item of contents) {
      if (!item.slug) continue;
      bySlug.set(item.slug, item);
      const english = item.translations.find((t) => t.language_id === ENGLISH_ID)?.name;
      // First slug wins: several slugs share copy like "Continue".
      if (english && !slugByEnglish.has(normalise(english))) {
        slugByEnglish.set(normalise(english), item.slug);
      }
    }
    return { bySlug, slugByEnglish };
  }, [contents]);

  const isRtl = languages.find((l) => l.id === languageId)?.is_rtl ?? false;

  useEffect(() => {
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = languageCode;
  }, [isRtl, languageCode]);

  const t = useCallback((slug: string, fallback?: string) => {
    const item = bySlug.get(slug);
    return corrected(slug, languageId, item?.translations.find((x) => x.language_id === languageId)?.name)
      ?? item?.translations.find((x) => x.language_id === ENGLISH_ID)?.name
      ?? CLIENT_CONTENT[slug]?.[languageCode]
      ?? fallback ?? slug;
  }, [bySlug, languageId, languageCode]);

  const translateEnglish = useCallback((english: string) => {
    if (languageId === ENGLISH_ID) return null;
    const slug = slugByEnglish.get(normalise(english));
    if (!slug) return null;
    return corrected(slug, languageId, bySlug.get(slug)?.translations.find((x) => x.language_id === languageId)?.name) ?? null;
  }, [bySlug, slugByEnglish, languageId]);

  const label = useCallback((item: BaseItem | undefined) => {
    if (!item) return "";
    return item.translations.find((x) => x.language_id === languageId)?.name
      ?? item.translations.find((x) => x.language_id === ENGLISH_ID)?.name
      ?? item.translations[0]?.name ?? item.code ?? "";
  }, [languageId]);

  const setLanguage = useCallback((language: Language) => {
    appLanguage.select(language);
    setLanguageId(language.id);
    setLanguageCode(language.code);
  }, []);

  const value = useMemo<I18nValue>(() => ({
    languageId, languageCode, isRtl, languages, t, translateEnglish, label, setLanguage,
  }), [languageId, languageCode, isRtl, languages, t, translateEnglish, label, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
