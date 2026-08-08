import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import AdminLogin from "./AdminLogin";
import UploadReview from "./UploadReview";
import ManageEvents from "./ManageEvents";
import Templates from "./Templates";

const TABS = [
  { key: "upload", labelKey: "admin.tabs.upload", Component: UploadReview },
  { key: "events", labelKey: "admin.tabs.events", Component: ManageEvents },
  { key: "templates", labelKey: "admin.tabs.templates", Component: Templates },
];

export default function AdminApp() {
  const { t } = useI18n();
  const [isAdmin, setIsAdmin] = useState(null); // null = checking
  const [tab, setTab] = useState("upload");

  useEffect(() => {
    api
      .adminMe()
      .then((d) => setIsAdmin(d.isAdmin))
      .catch(() => setIsAdmin(false));
  }, []);

  async function logout() {
    await api.adminLogout();
    setIsAdmin(false);
  }

  if (isAdmin === null) return null;
  if (!isAdmin) return <AdminLogin onLoggedIn={() => setIsAdmin(true)} />;

  const ActiveTab = TABS.find((tb) => tb.key === tab).Component;

  return (
    <div className="container" style={{ paddingTop: 28, paddingBottom: 60 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 4, background: "var(--paper-dim)", borderRadius: 999, padding: 3 }}>
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

      <ActiveTab />
    </div>
  );
}
