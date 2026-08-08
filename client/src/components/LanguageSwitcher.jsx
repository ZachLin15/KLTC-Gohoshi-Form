import React from "react";
import { useI18n } from "../i18n";

const LANGS = [
  { code: "en", key: "lang.en" },
  { code: "zh", key: "lang.zh" },
  { code: "ja", key: "lang.ja" },
];

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div style={styles.wrap} role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLocale(l.code)}
          style={{
            ...styles.btn,
            ...(locale === l.code ? styles.active : {}),
          }}
          aria-pressed={locale === l.code}
        >
          {t(l.key)}
        </button>
      ))}
    </div>
  );
}

const styles = {
  wrap: {
    display: "inline-flex",
    background: "var(--paper-dim)",
    borderRadius: 999,
    padding: 3,
    gap: 2,
  },
  btn: {
    border: "none",
    background: "transparent",
    color: "var(--text-dim)",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  active: {
    background: "var(--ink)",
    color: "var(--paper)",
  },
};
