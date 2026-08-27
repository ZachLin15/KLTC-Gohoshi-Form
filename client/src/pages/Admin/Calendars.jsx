import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import { LoadingBlock } from "../../components/Spinner";

function emptyCalendar() {
  return { name_en: "", name_zh: "", name_ja: "" };
}

export default function Calendars({ onChanged }) {
  const { t } = useI18n();
  const [calendars, setCalendars] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    api
      .adminGetCalendars()
      .then(setCalendars)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function save() {
    if (!editing.name_en.trim()) return;
    setSaving(true);
    setError("");
    try {
      if (editing.id) {
        await api.adminUpdateCalendar(editing.id, editing);
      } else {
        await api.adminCreateCalendar(editing);
      }
      setEditing(null);
      load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(cal) {
    if (cal.is_default) return;
    if (!window.confirm(t("admin.calendars.deleteConfirm", { name: cal.name_en }))) return;
    await api.adminDeleteCalendar(cal.id);
    load();
    onChanged?.();
  }

  return (
    <div>
      <h2 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>{t("admin.calendars.title")}</h2>
      <p style={{ color: "var(--text-dim)", maxWidth: 640 }}>{t("admin.calendars.helper")}</p>

      {!editing && (
        <button className="btn btn-gold" onClick={() => setEditing(emptyCalendar())}>
          + {t("admin.calendars.new")}
        </button>
      )}

      {editing && (
        <div className="card" style={{ padding: 18, marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            <input
              placeholder={`${t("admin.calendars.name")} (EN)`}
              value={editing.name_en}
              onChange={(e) => setEditing({ ...editing, name_en: e.target.value })}
              autoFocus
            />
            <input
              placeholder={`${t("admin.calendars.name")} (ZH)`}
              value={editing.name_zh}
              onChange={(e) => setEditing({ ...editing, name_zh: e.target.value })}
            />
            <input
              placeholder={`${t("admin.calendars.name")} (JA)`}
              value={editing.name_ja}
              onChange={(e) => setEditing({ ...editing, name_ja: e.target.value })}
            />
          </div>

          {error && <p style={{ color: "#b3453f", fontSize: "0.85rem" }}>{error}</p>}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-gold" disabled={saving || !editing.name_en.trim()} onClick={save}>
              {saving ? t("admin.review.saving") : t("admin.calendars.save")}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingBlock />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          {calendars.map((c) => (
            <div key={c.id} className="card" style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{c.name_en}</strong>
                {c.name_zh && <span style={{ color: "var(--text-dim)" }}> · {c.name_zh}</span>}
                {!!c.is_default && (
                  <span style={styles.mainBadge}>{t("admin.calendars.mainBadge")}</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-ghost btn" style={{ padding: "5px 10px", fontSize: "0.8rem" }} onClick={() => setEditing(c)}>
                  {t("admin.events.edit")}
                </button>
                {!c.is_default && (
                  <button
                    className="btn-ghost btn"
                    style={{ padding: "5px 10px", fontSize: "0.8rem", color: "#b3453f" }}
                    onClick={() => remove(c)}
                  >
                    {t("admin.calendars.delete")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  mainBadge: {
    marginLeft: 10,
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "var(--gold)",
    background: "#fbf3e2",
    borderRadius: 999,
    padding: "2px 9px",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
};
