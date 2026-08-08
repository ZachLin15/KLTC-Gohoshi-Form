import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import { colorVars } from "../../lib/colors";

export default function Report() {
  const { t, pickLang } = useI18n();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api
      .adminGetReport(year, month)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, [year, month]);

  const totalSignups = events.reduce(
    (sum, e) => sum + e.roles.reduce((s, r) => s + r.signups.length, 0),
    0
  );
  const totalOpenRoles = events.reduce(
    (sum, e) => sum + e.roles.filter((r) => r.signups.length < r.limit_count).length,
    0
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
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
        <a
          href={api.adminReportCsvUrl(year, month)}
          className="btn btn-gold"
          style={{ marginLeft: "auto", textDecoration: "none" }}
        >
          ⬇ Download CSV
        </a>
      </div>

      {!loading && (
        <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: 0, marginBottom: 20 }}>
          {totalSignups} sign-up{totalSignups === 1 ? "" : "s"} · {totalOpenRoles} role
          {totalOpenRoles === 1 ? "" : "s"} still open
        </p>
      )}

      {!loading && events.length === 0 && (
        <p style={{ color: "var(--text-dim)" }}>{t("admin.events.noEvents")}</p>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Time</th>
              <th style={styles.th}>Event</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Signed up by</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) =>
              e.roles.length === 0 ? null : (
                e.roles.map((r, ri) => {
                  const colors = colorVars(e.color);
                  const rows = r.signups.length > 0 ? r.signups : [null];
                  return rows.map((s, si) => (
                    <tr key={`${e.id}-${r.id}-${si}`} style={styles.tr}>
                      {ri === 0 && si === 0 && (
                        <>
                          <td style={{ ...styles.td, ...styles.dateCell }} rowSpan={countRows(e)}>
                            {e.day}
                          </td>
                          <td style={{ ...styles.td, ...styles.timeCell }} rowSpan={countRows(e)}>
                            {e.time}
                          </td>
                          <td style={styles.td} rowSpan={countRows(e)}>
                            <span
                              style={{
                                ...styles.eventTag,
                                background: colors.bg,
                                borderColor: colors.line,
                              }}
                            >
                              {pickLang(e, "name")}
                            </span>
                          </td>
                        </>
                      )}
                      <td style={styles.td}>{pickLang(r, "name")}</td>
                      <td style={styles.td}>
                        {s ? (
                          s.name
                        ) : (
                          <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>— open —</span>
                        )}
                      </td>
                    </tr>
                  ));
                })
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function countRows(event) {
  let n = 0;
  event.roles.forEach((r) => {
    n += r.signups.length > 0 ? r.signups.length : 1;
  });
  return n;
}

const styles = {
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.85rem",
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    background: "var(--paper-dim)",
    fontSize: "0.72rem",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-dim)",
    borderBottom: "1px solid var(--line)",
  },
  tr: {
    borderBottom: "1px solid var(--line)",
  },
  td: {
    padding: "8px 12px",
    verticalAlign: "top",
  },
  dateCell: {
    fontFamily: "var(--font-mono)",
    fontWeight: 700,
  },
  timeCell: {
    fontFamily: "var(--font-mono)",
    color: "var(--text-dim)",
    whiteSpace: "nowrap",
  },
  eventTag: {
    display: "inline-block",
    border: "1px solid",
    borderRadius: 5,
    padding: "2px 8px",
    fontWeight: 600,
    fontSize: "0.8rem",
  },
};
