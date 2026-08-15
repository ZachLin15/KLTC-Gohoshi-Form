import React, { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { colorVars } from "../lib/colors";
import { getLastUsedName, getRememberedNames, rememberName } from "../lib/nameMemory";
import { LoadingBlock } from "../components/Spinner";

const INTL_LOCALE = { en: "en-US", zh: "zh-CN", ja: "ja-JP" };

export default function MySignups() {
  const { t, pickLang, locale } = useI18n();
  const [name, setName] = useState("");
  const [results, setResults] = useState(null); // null = haven't searched yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const remembered = getRememberedNames();

  useEffect(() => {
    const last = getLastUsedName();
    if (last) {
      setName(last);
      runSearch(last);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(searchName) {
    const trimmed = (searchName ?? name).trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.lookupSignups(trimmed);
      setResults(data);
      rememberName(trimmed);
    } catch (e) {
      setError(t("mySignups.error"));
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    runSearch();
  }

  const today = new Date();
  const todayNum = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const upcoming = (results || []).filter((r) => r.year * 10000 + r.month * 100 + r.day >= todayNum);
  const past = (results || []).filter((r) => r.year * 10000 + r.month * 100 + r.day < todayNum);

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60, maxWidth: 640 }}>
      <h1 style={styles.title}>{t("mySignups.title")}</h1>
      <p style={styles.subtitle}>{t("mySignups.subtitle")}</p>

      <form onSubmit={onSubmit} style={styles.searchRow}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("event.namePlaceholder")}
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn btn-gold" disabled={!name.trim() || loading}>
          {t("mySignups.search")}
        </button>
      </form>

      {remembered.length > 1 && (
        <div style={styles.chipRow}>
          {remembered.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setName(n);
                runSearch(n);
              }}
              style={{ ...styles.chip, ...(n === name ? styles.chipActive : {}) }}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {loading && <LoadingBlock />}

      {error && <p style={{ color: "#b3453f" }}>{error}</p>}

      {!loading && !error && results !== null && results.length === 0 && (
        <p style={{ color: "var(--text-dim)", marginTop: 24 }}>{t("mySignups.none")}</p>
      )}

      {!loading && !error && results !== null && results.length > 0 && (
        <div style={{ marginTop: 24 }}>
          {upcoming.length > 0 && (
            <Section title={t("mySignups.upcoming")} items={upcoming} pickLang={pickLang} locale={locale} />
          )}
          {past.length > 0 && (
            <Section title={t("mySignups.past")} items={past} pickLang={pickLang} locale={locale} faded />
          )}
        </div>
      )}

      {!loading && results === null && !error && (
        <p style={{ color: "var(--text-dim)", marginTop: 24 }}>{t("mySignups.prompt")}</p>
      )}
    </div>
  );
}

function Section({ title, items, pickLang, locale, faded }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((r) => {
          const colors = colorVars(r.color);
          const dateLabel = new Intl.DateTimeFormat(INTL_LOCALE[locale] || "en-US", {
            month: "long",
            day: "numeric",
          }).format(new Date(r.year, r.month - 1, r.day));
          return (
            <div
              key={r.signup_id}
              className="card"
              style={{
                borderLeft: `4px solid ${colors.line}`,
                padding: "12px 16px",
                opacity: faded ? 0.65 : 1,
              }}
            >
              <div style={styles.cardTop}>
                <span style={styles.cardDate}>
                  {dateLabel} · {r.time}
                </span>
              </div>
              <div style={styles.cardEvent}>{pickLang({ name_en: r.event_name_en, name_zh: r.event_name_zh, name_ja: r.event_name_ja }, "name")}</div>
              <div style={styles.cardRole}>
                {pickLang({ name_en: r.role_name_en, name_zh: r.role_name_zh, name_ja: r.role_name_ja }, "name")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "1.6rem",
    fontWeight: 600,
    color: "var(--ink)",
    margin: "0 0 6px",
  },
  subtitle: {
    color: "var(--text-dim)",
    fontSize: "0.92rem",
    marginBottom: 20,
  },
  searchRow: {
    display: "flex",
    gap: 10,
  },
  chipRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 10,
  },
  chip: {
    border: "1px solid var(--line)",
    background: "#fff",
    borderRadius: 999,
    padding: "5px 12px",
    fontSize: "0.8rem",
    color: "var(--text-dim)",
    cursor: "pointer",
  },
  chipActive: {
    borderColor: "var(--gold)",
    color: "var(--ink)",
    fontWeight: 600,
    background: "#fbf3e2",
  },
  sectionTitle: {
    fontFamily: "var(--font-display)",
    fontSize: "1.05rem",
    color: "var(--ink)",
    marginBottom: 10,
  },
  cardTop: {
    marginBottom: 4,
  },
  cardDate: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.78rem",
    fontWeight: 700,
    color: "var(--text-dim)",
  },
  cardEvent: {
    fontWeight: 600,
    color: "var(--ink)",
    fontSize: "0.95rem",
  },
  cardRole: {
    color: "var(--text-dim)",
    fontSize: "0.85rem",
    marginTop: 2,
  },
};
