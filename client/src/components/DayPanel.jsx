import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { colorVars } from "../lib/colors";
import { LoadingBlock } from "./Spinner";

const INTL_LOCALE = { en: "en-US", zh: "zh-CN", ja: "ja-JP" };

export default function DayPanel({ year, month, day, onClose, onSelectEvent, pickLang, locale, t }) {
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .getEventsForDay(year, month, day)
      .then((data) => !cancelled && setEvents(data))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [year, month, day]);

  const dateLabel = new Intl.DateTimeFormat(INTL_LOCALE[locale] || "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(year, month - 1, day));

  return (
    <div className="card" style={styles.panel}>
      <div style={styles.header}>
        <h2 style={styles.dateTitle}>{dateLabel}</h2>
        <button onClick={onClose} aria-label={t("event.close")} style={styles.closeBtn}>
          ✕
        </button>
      </div>

      {loading && <LoadingBlock />}
      {error && !loading && <p style={{ color: "#b3453f", padding: "0 20px" }}>{t("dayPanel.error")}</p>}

      {!loading && !error && events && events.length === 0 && (
        <p style={styles.empty}>{t("dayPanel.noEvents")}</p>
      )}

      {!loading && !error && events && events.length > 0 && (
        <div style={styles.eventList}>
          {events.map((e) => {
            const colors = colorVars(e.color);
            return (
              <div key={e.id} style={{ ...styles.eventBlock, borderLeft: `3px solid ${colors.line}` }}>
                <button
                  type="button"
                  onClick={() => onSelectEvent(e)}
                  style={styles.eventNameBtn}
                  title={t("dayPanel.openToSignUp")}
                >
                  <span style={styles.eventTime}>{e.time}</span>
                  <span style={styles.eventName}>{pickLang(e, "name")}</span>
                </button>

                {e.needs_signup && e.roles.length > 0 ? (
                  <div style={styles.roleList}>
                    {e.roles.map((r) => (
                      <div key={r.id} style={styles.roleRow}>
                        <div style={styles.roleHeader}>
                          <span style={styles.roleName}>{pickLang(r, "name")}</span>
                          <span style={styles.roleCount}>
                            {r.signup_count}/{r.limit_count}
                          </span>
                        </div>
                        {r.signups.length > 0 ? (
                          <div style={styles.nameChips}>
                            {r.signups.map((s, i) => (
                              <span key={i} style={styles.nameChip}>
                                {s.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div style={styles.noSignups}>{t("dayPanel.noSignupsYet")}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={styles.noSignups}>{t("event.noRoles")}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  panel: {
    width: 340,
    flexShrink: 0,
    maxHeight: "calc(100vh - 140px)",
    overflowY: "auto",
    position: "sticky",
    top: 84,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "18px 20px 14px",
    borderBottom: "1px solid var(--line)",
  },
  dateTitle: {
    fontFamily: "var(--font-display)",
    fontSize: "1.15rem",
    fontWeight: 600,
    color: "var(--ink)",
    margin: 0,
  },
  closeBtn: {
    border: "none",
    background: "var(--paper-dim)",
    borderRadius: "50%",
    width: 28,
    height: 28,
    cursor: "pointer",
    fontSize: "0.8rem",
    color: "var(--ink)",
    flexShrink: 0,
  },
  empty: {
    color: "var(--text-dim)",
    padding: "20px",
    fontSize: "0.88rem",
  },
  eventList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 0",
  },
  eventBlock: {
    padding: "10px 16px 14px",
  },
  eventNameBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: 0,
    marginBottom: 8,
    width: "100%",
    textAlign: "left",
  },
  eventTime: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "var(--text-dim)",
  },
  eventName: {
    fontSize: "0.92rem",
    fontWeight: 600,
    color: "var(--ink)",
  },
  roleList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  roleRow: {
    background: "var(--paper-dim)",
    borderRadius: 8,
    padding: "8px 10px",
  },
  roleHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  roleName: {
    fontSize: "0.82rem",
    fontWeight: 600,
    color: "var(--ink)",
  },
  roleCount: {
    fontSize: "0.75rem",
    fontFamily: "var(--font-mono)",
    color: "var(--text-dim)",
  },
  nameChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
  },
  nameChip: {
    fontSize: "0.76rem",
    background: "#fff",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "2px 9px",
    color: "var(--text)",
  },
  noSignups: {
    fontSize: "0.78rem",
    color: "var(--text-dim)",
    fontStyle: "italic",
  },
};
