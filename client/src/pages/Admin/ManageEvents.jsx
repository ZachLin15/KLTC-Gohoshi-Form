import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import { colorVars } from "../../lib/colors";

export default function ManageEvents() {
  const { t, pickLang } = useI18n();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);

  function load() {
    setLoading(true);
    api
      .adminGetEvents(year, month)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, [year, month]);

  async function toggleExpand(id) {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(id);
    const d = await api.adminGetEvent(id);
    setDetail(d);
  }

  async function handleDelete(id) {
    if (!window.confirm(t("admin.events.deleteConfirm"))) return;
    await api.adminDeleteEvent(id);
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
    }
    load();
  }

  async function handleRemoveSignup(signupId, eventId) {
    await api.adminDeleteSignup(signupId);
    const d = await api.adminGetEvent(eventId);
    setDetail(d);
    load();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("admin.events.selectMonth")}</label>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          style={{ width: 90 }}
        />
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {Array.from({ length: 12 }).map((_, i) => (
            <option key={i} value={i + 1}>
              {new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(2000, i, 1))}
            </option>
          ))}
        </select>
      </div>

      {!loading && events.length === 0 && (
        <p style={{ color: "var(--text-dim)" }}>{t("admin.events.noEvents")}</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {events.map((e) => {
          const colors = colorVars(e.color);
          const isOpen = expanded === e.id;
          return (
            <div key={e.id} className="card" style={{ borderLeft: `4px solid ${colors.line}` }}>
              <div style={styles.row} onClick={() => toggleExpand(e.id)}>
                <span style={styles.day}>{e.day}</span>
                <span style={styles.time}>{e.time}</span>
                <span style={styles.name}>{pickLang(e, "name")}</span>
                <span style={styles.roleCount}>
                  {e.roles.length > 0 ? `${t("admin.events.roles")}: ${e.roles.length}` : ""}
                </span>
                <button
                  className="btn-ghost btn"
                  style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    handleDelete(e.id);
                  }}
                >
                  {t("admin.events.delete")}
                </button>
              </div>

              {isOpen && detail && detail.id === e.id && detail.roles.length > 0 && (
                <div style={styles.rolesPanel}>
                  {detail.roles.map((r) => (
                    <div key={r.id} style={styles.rolePanelRow}>
                      <div style={styles.rolePanelHeader}>
                        <strong>{pickLang(r, "name")}</strong>
                        <span style={{ color: "var(--text-dim)", fontSize: "0.82rem" }}>
                          {r.signup_count} {t("admin.events.of")} {r.limit_count}
                        </span>
                      </div>
                      {r.signups.length > 0 && (
                        <ul style={styles.signupUl}>
                          {r.signups.map((s) => (
                            <li key={s.id} style={styles.signupLi}>
                              {s.name}
                              <button
                                style={styles.signupRemove}
                                onClick={() => handleRemoveSignup(s.id, e.id)}
                              >
                                {t("admin.events.removeSignup")}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    cursor: "pointer",
  },
  day: { fontFamily: "var(--font-mono)", fontWeight: 700, width: 24 },
  time: { fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--text-dim)", width: 56 },
  name: { flex: 1, fontWeight: 500 },
  roleCount: { fontSize: "0.8rem", color: "var(--text-dim)" },
  rolesPanel: {
    borderTop: "1px solid var(--line)",
    padding: "10px 16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  rolePanelRow: {},
  rolePanelHeader: { display: "flex", justifyContent: "space-between", marginBottom: 4 },
  signupUl: { listStyle: "none", margin: "4px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4 },
  signupLi: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.85rem",
    color: "var(--text-dim)",
  },
  signupRemove: {
    border: "none",
    background: "transparent",
    color: "#b3453f",
    cursor: "pointer",
    fontSize: "0.78rem",
  },
};
