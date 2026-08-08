import React, { createContext, useContext, useMemo, useState, useCallback } from "react";
import en from "./en.json";
import zh from "./zh.json";
import ja from "./ja.json";

const DICTS = { en, zh, ja };
const STORAGE_KEY = "kltc_locale";

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "en";
    } catch {
      return "en";
    }
  });

  const setLocale = useCallback((l) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key, vars) => {
      const dict = DICTS[locale] || DICTS.en;
      let str = dict[key] ?? DICTS.en[key] ?? key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
        });
      }
      return str;
    },
    [locale]
  );

  // Pick the best available language field from a trilingual DB record,
  // e.g. pickLang(event, "name") reads event.name_en/zh/ja with EN fallback.
  const pickLang = useCallback(
    (obj, prefix) => {
      if (!obj) return "";
      const key = `${prefix}_${locale}`;
      if (obj[key] && String(obj[key]).trim()) return obj[key];
      if (obj[`${prefix}_en`] && String(obj[`${prefix}_en`]).trim()) return obj[`${prefix}_en`];
      // last resort: any non-empty language
      for (const l of ["en", "zh", "ja"]) {
        if (obj[`${prefix}_${l}`]) return obj[`${prefix}_${l}`];
      }
      return "";
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t, pickLang }), [locale, setLocale, t, pickLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
