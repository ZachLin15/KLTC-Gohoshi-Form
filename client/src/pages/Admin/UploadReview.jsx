import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import { colorVars, COLOR_OPTIONS } from "../../lib/colors";

function emptyRoleRow() {
  return { name_en: "", name_zh: "", name_ja: "", limit_count: 1 };
}

export default function UploadReview() {
  const { t } = useI18n();
  const fileRef = useRef(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState(null); // {month, year, events}
  const [rows, setRows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [replace, setReplace] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    api.adminGetTemplates().then(setTemplates).catch(() => {});
  }, []);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setParsing(true);
    setError("");
    setSavedMsg("");
    try {
      const data = await api.uploadPdf(file);
      setParsed(data);
      setRows(
        data.events.map((ev) => ({
          ...ev,
          needs_signup: true,
          template_id: null,
          roles: [],
        }))
      );
    } catch (e) {
      setError(e.message || t("admin.upload.error"));
      setParsed(null);
      setRows([]);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function updateRow(i, patch) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function applyTemplate(i, templateId) {
    const tpl = templates.find((tp) => String(tp.id) === String(templateId));
    if (!tpl) {
      updateRow(i, { template_id: null, roles: [] });
      return;
    }
    updateRow(i, {
      template_id: tpl.id,
      roles: tpl.roles.map((r) => ({
        name_en: r.name_en,
        name_zh: r.name_zh,
        name_ja: r.name_ja,
        limit_count: r.limit_count,
      })),
    });
  }

  function removeRow(i) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateRole(rowIdx, roleIdx, patch) {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== rowIdx) return r;
        const roles = r.roles.map((role, ri) => (ri === roleIdx ? { ...role, ...patch } : role));
        return { ...r, roles };
      })
    );
  }

  function addRole(rowIdx) {
    setRows((prev) =>
      prev.map((r, idx) => (idx === rowIdx ? { ...r, roles: [...r.roles, emptyRoleRow()] } : r))
    );
  }

  function removeRole(rowIdx, roleIdx) {
    setRows((prev) =>
      prev.map((r, idx) =>
        idx === rowIdx ? { ...r, roles: r.roles.filter((_, ri) => ri !== roleIdx) } : r
      )
    );
  }

  async function save() {
    if (!parsed) return;
    setSaving(true);
    setError("");
    try {
      const monthNum = new Date(`${parsed.month} 1, ${parsed.year}`).getMonth() + 1;
      const payload = {
        year: parsed.year,
        month: monthNum,
        replace,
        events: rows.map((r) => ({
          day: r.date ?? r.day,
          time: r.time || "",
          name_en: r.name_en || "",
          name_zh: r.name_zh || "",
          name_ja: r.name_ja || "",
          color: r.color || "yellow",
          needs_signup: r.needs_signup,
          template_id: r.template_id,
          roles: r.roles,
        })),
      };
      const res = await api.adminBulkCreateEvents(payload);
      setSavedMsg(t("admin.review.saved", { count: res.ids.length }));
      setParsed(null);
      setRows([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {!parsed && (
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>
            {t("admin.upload.title")}
          </h2>
          <p style={{ color: "var(--text-dim)", maxWidth: 640 }}>{t("admin.upload.helper")}</p>
          <input ref={fileRef} type="file" accept="application/pdf" onChange={handleFile} />
          {parsing && <p style={{ color: "var(--text-dim)" }}>{t("admin.upload.parsing")}</p>}
          {error && <p style={{ color: "#b3453f" }}>{error}</p>}
          {savedMsg && <p style={{ color: "var(--c-green-line)" }}>{savedMsg}</p>}
        </div>
      )}

      {parsed && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontFamily: "var(--font-display)", margin: 0 }}>{t("admin.review.title")}</h2>
            <span style={{ color: "var(--text-dim)", fontSize: "0.88rem" }}>
              {t("admin.upload.parsed", { count: parsed.events.length, month: parsed.month, year: parsed.year })}
            </span>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: "0.88rem" }}>
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            {t("admin.review.replaceWarning", { month: parsed.month, year: parsed.year })}
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {rows.map((r, i) => (
              <RowEditor
                key={i}
                row={r}
                templates={templates}
                t={t}
                onChange={(patch) => updateRow(i, patch)}
                onApplyTemplate={(tid) => applyTemplate(i, tid)}
                onRemove={() => removeRow(i)}
                onUpdateRole={(ri, patch) => updateRole(i, ri, patch)}
                onAddRole={() => addRole(i)}
                onRemoveRole={(ri) => removeRole(i, ri)}
              />
            ))}
          </div>

          {error && <p style={{ color: "#b3453f" }}>{error}</p>}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button className="btn btn-gold" onClick={save} disabled={saving}>
              {saving ? t("admin.review.saving") : t("admin.review.save")}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setParsed(null);
                setRows([]);
              }}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RowEditor({ row, templates, t, onChange, onApplyTemplate, onRemove, onUpdateRole, onAddRole, onRemoveRole }) {
  const colors = colorVars(row.color);
  return (
    <div className="card" style={{ padding: 16, borderLeft: `4px solid ${colors.line}` }}>
      <div style={rowStyles.topLine}>
        <input
          type="number"
          value={row.date ?? row.day}
          onChange={(e) => onChange({ date: Number(e.target.value), day: Number(e.target.value) })}
          style={rowStyles.smallInput}
          title={t("admin.review.day")}
        />
        <input
          value={row.time || ""}
          onChange={(e) => onChange({ time: e.target.value })}
          style={rowStyles.timeInput}
          title={t("admin.review.time")}
        />
        <select value={row.color} onChange={(e) => onChange({ color: e.target.value })} style={rowStyles.colorSelect}>
          {COLOR_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label style={rowStyles.checkboxLabel}>
          <input
            type="checkbox"
            checked={row.needs_signup}
            onChange={(e) => onChange({ needs_signup: e.target.checked })}
          />
          {t("admin.review.needsSignup")}
        </label>
        <button type="button" onClick={onRemove} style={rowStyles.removeBtn}>
          {t("admin.review.remove")}
        </button>
      </div>

      <div style={rowStyles.nameGrid}>
        <input
          value={row.name_en || ""}
          onChange={(e) => onChange({ name_en: e.target.value })}
          placeholder={t("admin.review.nameEn")}
        />
        <input
          value={row.name_zh || ""}
          onChange={(e) => onChange({ name_zh: e.target.value })}
          placeholder={t("admin.review.nameZh")}
        />
        <input
          value={row.name_ja || ""}
          onChange={(e) => onChange({ name_ja: e.target.value })}
          placeholder={t("admin.review.nameJa")}
        />
      </div>

      {row.needs_signup && (
        <div style={rowStyles.rolesBlock}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-dim)" }}>
              {t("admin.review.template")}
            </span>
            <select value={row.template_id || ""} onChange={(e) => onApplyTemplate(e.target.value)}>
              <option value="">{t("admin.review.none")}</option>
              {templates.map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.name_en}
                </option>
              ))}
            </select>
          </div>

          {row.roles.map((role, ri) => (
            <div key={ri} style={rowStyles.roleLine}>
              <input
                value={role.name_en}
                onChange={(e) => onUpdateRole(ri, { name_en: e.target.value })}
                placeholder="Role (EN)"
                style={{ flex: 1 }}
              />
              <input
                value={role.name_zh}
                onChange={(e) => onUpdateRole(ri, { name_zh: e.target.value })}
                placeholder="角色 (ZH)"
                style={{ flex: 1 }}
              />
              <input
                type="number"
                min={1}
                value={role.limit_count}
                onChange={(e) => onUpdateRole(ri, { limit_count: Number(e.target.value) })}
                style={{ width: 64 }}
              />
              <button type="button" onClick={() => onRemoveRole(ri)} style={rowStyles.smallRemove}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={onAddRole} className="btn btn-ghost" style={{ marginTop: 6, padding: "6px 12px", fontSize: "0.8rem" }}>
            + {t("admin.templates.addRole")}
          </button>
        </div>
      )}
    </div>
  );
}

const rowStyles = {
  topLine: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  smallInput: { width: 56 },
  timeInput: { width: 80 },
  colorSelect: { width: 100 },
  checkboxLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "var(--text-dim)", marginLeft: "auto" },
  removeBtn: { border: "none", background: "transparent", color: "#b3453f", cursor: "pointer", fontSize: "0.82rem" },
  nameGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 },
  rolesBlock: { borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 4 },
  roleLine: { display: "flex", gap: 8, alignItems: "center", marginBottom: 6 },
  smallRemove: { border: "none", background: "transparent", color: "var(--text-dim)", cursor: "pointer" },
};
