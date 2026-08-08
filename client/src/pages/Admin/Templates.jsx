import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";

function emptyTemplate() {
  return { name_en: "", name_zh: "", name_ja: "", roles: [{ name_en: "", name_zh: "", name_ja: "", limit_count: 1 }] };
}

export default function Templates() {
  const { t } = useI18n();
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null); // template being edited (or new)
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api
      .adminGetTemplates()
      .then(setTemplates)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function save() {
    if (!editing.name_en.trim()) return;
    if (editing.id) {
      await api.adminUpdateTemplate(editing.id, editing);
    } else {
      await api.adminCreateTemplate(editing);
    }
    setEditing(null);
    load();
  }

  async function remove(id) {
    if (!window.confirm(t("admin.templates.delete") + "?")) return;
    await api.adminDeleteTemplate(id);
    load();
  }

  function updateRole(i, patch) {
    setEditing((prev) => ({
      ...prev,
      roles: prev.roles.map((r, ri) => (ri === i ? { ...r, ...patch } : r)),
    }));
  }
  function addRole() {
    setEditing((prev) => ({
      ...prev,
      roles: [...prev.roles, { name_en: "", name_zh: "", name_ja: "", limit_count: 1 }],
    }));
  }
  function removeRole(i) {
    setEditing((prev) => ({ ...prev, roles: prev.roles.filter((_, ri) => ri !== i) }));
  }

  return (
    <div>
      <h2 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>{t("admin.templates.title")}</h2>
      <p style={{ color: "var(--text-dim)", maxWidth: 640 }}>{t("admin.templates.helper")}</p>

      {!editing && (
        <button className="btn btn-gold" onClick={() => setEditing(emptyTemplate())}>
          + {t("admin.templates.new")}
        </button>
      )}

      {editing && (
        <div className="card" style={{ padding: 18, marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            <input
              placeholder={`${t("admin.templates.name")} (EN)`}
              value={editing.name_en}
              onChange={(e) => setEditing({ ...editing, name_en: e.target.value })}
            />
            <input
              placeholder={`${t("admin.templates.name")} (ZH)`}
              value={editing.name_zh}
              onChange={(e) => setEditing({ ...editing, name_zh: e.target.value })}
            />
            <input
              placeholder={`${t("admin.templates.name")} (JA)`}
              value={editing.name_ja}
              onChange={(e) => setEditing({ ...editing, name_ja: e.target.value })}
            />
          </div>

          {editing.roles.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input
                placeholder={`${t("admin.templates.roleName")} (EN)`}
                value={r.name_en}
                onChange={(e) => updateRole(i, { name_en: e.target.value })}
                style={{ flex: 1 }}
              />
              <input
                placeholder={`${t("admin.templates.roleName")} (ZH)`}
                value={r.name_zh}
                onChange={(e) => updateRole(i, { name_zh: e.target.value })}
                style={{ flex: 1 }}
              />
              <input
                type="number"
                min={1}
                value={r.limit_count}
                onChange={(e) => updateRole(i, { limit_count: Number(e.target.value) })}
                style={{ width: 70 }}
                title={t("admin.templates.limit")}
              />
              <button type="button" onClick={() => removeRole(i)} style={{ border: "none", background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost" onClick={addRole} style={{ marginTop: 4, padding: "6px 12px", fontSize: "0.82rem" }}>
            + {t("admin.templates.addRole")}
          </button>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn btn-gold" onClick={save}>
              {t("admin.templates.save")}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
        {templates.map((tp) => (
          <div key={tp.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{tp.name_en}{tp.name_zh ? ` · ${tp.name_zh}` : ""}</strong>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-ghost btn" style={{ padding: "5px 10px", fontSize: "0.8rem" }} onClick={() => setEditing(tp)}>
                  {t("admin.events.edit")}
                </button>
                <button
                  className="btn-ghost btn"
                  style={{ padding: "5px 10px", fontSize: "0.8rem", color: "#b3453f" }}
                  onClick={() => remove(tp.id)}
                >
                  {t("admin.templates.delete")}
                </button>
              </div>
            </div>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {tp.roles.map((r) => (
                <span
                  key={r.id}
                  style={{
                    fontSize: "0.78rem",
                    background: "var(--paper-dim)",
                    borderRadius: 999,
                    padding: "3px 10px",
                    color: "var(--text-dim)",
                  }}
                >
                  {r.name_en} × {r.limit_count}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
