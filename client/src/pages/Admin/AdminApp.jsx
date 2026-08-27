import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import AdminLogin from "./AdminLogin";
import UploadReview from "./UploadReview";
import ManageEvents from "./ManageEvents";
import Templates from "./Templates";
import Report from "./Report";
import Calendars from "./Calendars";

const TABS = [
  { key: "upload", labelKey: "admin.tabs.upload", Component: UploadReview, needsCalendar: true },
  { key: "events", labelKey: "admin.tabs.events", Component: ManageEvents, needsCalendar: true },
  { key: "report", labelKey: "admin.tabs.report", Component: Report, needsCalendar: true },
  { key: "templates", labelKey: "admin.tabs.templates", Component: Templates, needsCalendar: false },
  { key: "calendars", labelKey: "admin.tabs.calendars", Component: Calendars, needsCalendar: false },
];

export default function AdminApp() {
  const { t, pickLang } = useI18n();
  const [isAdmin, setIsAdmin] = useState(null); // null = checking
  const [tab, setTab] = useState("upload");
  const [calendars, setCalendars] = useState([]);
  const [calendarId, setCalendarId] = useState(1);

  useEffect(() => {
    api
      .adminMe()
      .then((d) => setIsAdmin(d.isAdmin))
      .catch(() => setIsAdmin(false));
  }, []);

  function loadCalendars() {
    api
      .adminGetCalendars()
      .then((data) => {
        setCalendars(data);
        if (data.length > 0 && !data.some((c) => c.id === calendarId)) {
          setCalendarId(data[0].id);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (isAdmin) loadCalendars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function logout() {
    await api.adminLogout();
    setIsAdmin(false);
  }

  if (isAdmin === null) return null;
  if (!isAdmin) return <AdminLogin onLoggedIn={() => setIsAdmin(true)} />;

  const activeTabDef = TABS.find((tb) => tb.key === tab);
  const ActiveTab = activeTabDef.Component;

  return (
    <div className="container" style={{ paddingTop: 28, paddingBottom: 60 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", rowGap: 10 }}>
        <div style={{ display: "flex", gap: 4, background: "var(--paper-dim)", borderRadius: 999, padding: 3, flexWrap: "wrap", rowGap: 4 }}>
          {TABS.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              style={{
                border: "none",
                background: tab === tb.key ? "var(--ink)" : "transparent",
                color: tab === tb.key ? "var(--paper)" : "var(--text-dim)",
                padding: "8px 16px",
                borderRadius: 999,
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              {t(tb.labelKey)}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={logout}>
          {t("admin.signOut")}
        </button>
      </div>

      {activeTabDef.needsCalendar && calendars.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-dim)" }}>
            {t("admin.calendars.workingIn")}
          </label>
          <select value={calendarId} onChange={(e) => setCalendarId(Number(e.target.value))}>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {pickLang(c, "name")}
              </option>
            ))}
          </select>
        </div>
      )}

      {activeTabDef.needsCalendar ? (
        <ActiveTab calendarId={calendarId} calendars={calendars} />
      ) : tab === "calendars" ? (
        <ActiveTab onChanged={loadCalendars} />
      ) : (
        <ActiveTab />
      )}
    </div>
  );
}
