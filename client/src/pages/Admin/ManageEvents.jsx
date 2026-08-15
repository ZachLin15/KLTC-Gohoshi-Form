import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import { colorVars, COLOR_OPTIONS } from "../../lib/colors";
import Spinner, { LoadingBlock } from "../../components/Spinner";

function emptyRole() {
  return { name_en: "", name_zh: "", name_ja: "", limit_count: 1 };
}

function emptyNewEvent(year, month) {
  return {
    year,
    month,
    day: 1,
    time: "10:00",
    name_en: "",
    name_zh: "",
    name_ja: "",
    color: "yellow",
    needs_signup: true,
    template_id: null,
    roles: [],
  };
}

export default function ManageEvents() {
  const { t, pickLang } = useI18n();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftRoles, setDraftRoles] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEvent, setNewEvent] = useState(null);
  const [savingNew, setSavingNew] = useState(false);

  function load() {
    setLoading(true);
    api
      .adminGetEvents(year, month)
      .then((data) => {
        setEvents(data);
        setSelected(new Set());
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, [year, month]);
  useEffect(() => {
    api.adminGetTemplates().then(setTemplates).catch(() => {});
  }, []);

  async function toggleExpand(id) {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      setEditing(false);
      return;
    }
    setExpanded(id);
    setEditing(false);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await api.adminGetEvent(id);
      setDetail(d);
    } finally {
      setDetailLoading(false);
    }
  }

  function startEditingRoles() {
    setDraftRoles(
      detail.roles.map((r) => ({
        name_en: r.name_en,
        name_zh: r.name_zh,
        name_ja: r.name_ja,
        limit_count: r.limit_count,
      }))
    );
    setEditing(true);
  }

  function applyTemplate(templateId) {
    const tpl = templates.find((tp) => String(tp.id) === String(templateId));
    if (!tpl) return;
    setDraftRoles(
      tpl.roles.map((r) => ({
        name_en: r.name_en,
        name_zh: r.name_zh,
        name_ja: r.name_ja,
        limit_count: r.limit_count,
      }))
    );
  }

  function updateDraftRole(i, patch) {
    setDraftRoles((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addDraftRole() {
    setDraftRoles((prev) => [...prev, emptyRole()]);
  }
  function removeDraftRole(i) {
    setDraftRoles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function saveRoles() {
    setSaving(true);
    try {
      await api.adminUpdateEvent(detail.id, {
        day: detail.day,
        time: detail.time,
        name_en: detail.name_en,
        name_zh: detail.name_zh,
        name_ja: detail.name_ja,
        color: detail.color,
        needs_signup: true,
        template_id: detail.template_id,
        roles: draftRoles,
      });
      const d = await api.adminGetEvent(detail.id);
      setDetail(d);
      setEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm(t("admin.events.deleteConfirm"))) return;
    await api.adminDeleteEvent(id);
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      setEditing(false);
    }
    load();
  }

  async function handleRemoveSignup(signupId, eventId) {
    await api.adminDeleteSignup(signupId);
    const d = await api.adminGetEvent(eventId);
    setDetail(d);
    load();
  }

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === events.length ? new Set() : new Set(events.map((e) => e.id))));
  }

  async function handleDeleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(t("admin.events.deleteSelectedConfirm", { count: ids.length }))) return;
    setDeletingSelected(true);
    try {
      await api.adminBulkDeleteEvents(ids);
      if (expanded && selected.has(expanded)) {
        setExpanded(null);
        setDetail(null);
      }
      load();
    } finally {
      setDeletingSelected(false);
    }
  }

  function startCreating() {
    setNewEvent(emptyNewEvent(year, month));
    setCreating(true);
  }

  function updateNewEvent(patch) {
    setNewEvent((prev) => ({ ...prev, ...patch }));
  }

  function applyTemplateToNew(templateId) {
    const tpl = templates.find((tp) => String(tp.id) === String(templateId));
    if (!tpl) {
      updateNewEvent({ template_id: null, roles: [] });
      return;
    }
    updateNewEvent({
      template_id: tpl.id,
      roles: tpl.roles.map((r) => ({
        name_en: r.name_en,
        name_zh: r.name_zh,
        name_ja: r.name_ja,
        limit_count: r.limit_count,
      })),
    });
  }

  function updateNewRole(i, patch) {
    setNewEvent((prev) => ({
      ...prev,
      roles: prev.roles.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));
  }
  function addNewRole() {
    setNewEvent((prev) => ({ ...prev, roles: [...prev.roles, emptyRole()] }));
  }
  function removeNewRole(i) {
    setNewEvent((prev) => ({ ...prev, roles: prev.roles.filter((_, idx) => idx !== i) }));
  }

  async function saveNewEvent() {
    if (!newEvent.name_en.trim()) return;
    setSavingNew(true);
    try {
      await api.adminBulkCreateEvents({
        year: newEvent.year,
        month: newEvent.month,
        replace: false,
        events: [
          {
            day: newEvent.day,
            time: newEvent.time,
            name_en: newEvent.name_en,
            name_zh: newEvent.name_zh,
            name_ja: newEvent.name_ja,
            color: newEvent.color,
            needs_signup: newEvent.needs_signup,
            template_id: newEvent.template_id,
            roles: newEvent.roles,
          },
        ],
      });
      setCreating(false);
      setNewEvent(null);
      if (newEvent.year === year && newEvent.month === month) {
        load();
      }
    } finally {
      setSavingNew(false);
    }
  }

  const allSelected = events.length > 0 && selected.size === events.length;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
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

        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {selected.size > 0 && (
            <button className="btn btn-danger" disabled={deletingSelected} onClick={handleDeleteSelected}>
              {deletingSelected
                ? t("admin.review.saving")
                : `${t("admin.events.deleteSelected")} (${selected.size})`}
            </button>
          )}
          {!creating && (
            <button className="btn btn-gold" onClick={startCreating}>
              + {t("admin.events.newEvent")}
            </button>
          )}
        </div>
      </div>

      {creating && newEvent && (
        <div className="card" style={{ padding: 18, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input
              type="number"
              value={newEvent.year}
              onChange={(e) => updateNewEvent({ year: Number(e.target.value) })}
              style={{ width: 90 }}
              title={t("admin.events.year")}
            />
            <select
              value={newEvent.month}
              onChange={(e) => updateNewEvent({ month: Number(e.target.value) })}
              title={t("admin.events.month")}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i} value={i + 1}>
                  {new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(2000, i, 1))}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={31}
              value={newEvent.day}
              onChange={(e) => updateNewEvent({ day: Number(e.target.value) })}
              style={{ width: 64 }}
              title={t("admin.events.day")}
            />
            <input
              value={newEvent.time}
              onChange={(e) => updateNewEvent({ time: e.target.value })}
              style={{ width: 80 }}
              placeholder="10:00"
            />
            <select value={newEvent.color} onChange={(e) => updateNewEvent({ color: e.target.value })} style={{ width: 100 }}>
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "var(--text-dim)" }}>
              <input
                type="checkbox"
                checked={newEvent.needs_signup}
                onChange={(e) => updateNewEvent({ needs_signup: e.target.checked })}
              />
              {t("admin.review.needsSignup")}
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            <input
              value={newEvent.name_en}
              onChange={(e) => updateNewEvent({ name_en: e.target.value })}
              placeholder={t("admin.review.nameEn")}
            />
            <input
              value={newEvent.name_zh}
              onChange={(e) => updateNewEvent({ name_zh: e.target.value })}
              placeholder={t("admin.review.nameZh")}
            />
            <input
              value={newEvent.name_ja}
              onChange={(e) => updateNewEvent({ name_ja: e.target.value })}
              placeholder={t("admin.review.nameJa")}
            />
          </div>

          {newEvent.needs_signup && (
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-dim)" }}>
                  {t("admin.review.template")}
                </span>
                <select value={newEvent.template_id || ""} onChange={(e) => applyTemplateToNew(e.target.value)}>
                  <option value="">{t("admin.review.none")}</option>
                  {templates.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.name_en}
                    </option>
                  ))}
                </select>
              </div>

              {newEvent.roles.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input
                    value={r.name_en}
                    onChange={(e) => updateNewRole(i, { name_en: e.target.value })}
                    placeholder="Role (EN)"
                    style={{ flex: 1 }}
                  />
                  <input
                    value={r.name_zh}
                    onChange={(e) => updateNewRole(i, { name_zh: e.target.value })}
                    placeholder="角色 (ZH)"
                    style={{ flex: 1 }}
                  />
                  <input
                    type="number"
                    min={1}
                    value={r.limit_count}
                    onChange={(e) => updateNewRole(i, { limit_count: Number(e.target.value) })}
                    style={{ width: 64 }}
                  />
                  <button
                    type="button"
                    onClick={() => removeNewRole(i)}
                    style={{ border: "none", background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={addNewRole}
                style={{ padding: "6px 12px", fontSize: "0.8rem" }}
              >
                + {t("admin.templates.addRole")}
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn btn-gold" disabled={savingNew || !newEvent.name_en.trim()} onClick={saveNewEvent}>
              {savingNew ? t("admin.review.saving") : t("admin.events.save")}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setCreating(false);
                setNewEvent(null);
              }}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {loading && <LoadingBlock />}

      {!loading && events.length === 0 && (
        <p style={{ color: "var(--text-dim)" }}>{t("admin.events.noEvents")}</p>
      )}

      {!loading && events.length > 0 && (
        <div>
          <div style={styles.headerRow}>
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ marginRight: 6 }} />
            <span style={{ ...styles.headerCell, width: 24 }}>{t("admin.events.colDate")}</span>
            <span style={{ ...styles.headerCell, width: 56 }}>{t("admin.events.colTime")}</span>
            <span style={{ ...styles.headerCell, flex: 1 }}>{t("admin.events.colEvent")}</span>
            <span style={styles.headerCell}>{t("admin.events.colRoles")}</span>
            <span style={{ ...styles.headerCell, textAlign: "right" }}>{t("admin.events.colActions")}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {events.map((e) => {
              const colors = colorVars(e.color);
              const isOpen = expanded === e.id;
              const isEditingThis = isOpen && editing;
              return (
                <div key={e.id} className="card" style={{ borderLeft: `4px solid ${colors.line}` }}>
                  <div style={styles.row}>
                    <input
                      type="checkbox"
                      checked={selected.has(e.id)}
                      onChange={(ev) => {
                        ev.stopPropagation();
                        toggleSelected(e.id);
                      }}
                      onClick={(ev) => ev.stopPropagation()}
                    />
                    <div style={styles.clickArea} onClick={() => toggleExpand(e.id)}>
                      <span style={styles.day}>{e.day}</span>
                      <span style={styles.time}>{e.time}</span>
                      <span style={styles.name}>{pickLang(e, "name")}</span>
                      <span style={styles.roleCount}>{e.roles.length > 0 ? e.roles.length : ""}</span>
                    </div>
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

                  {isOpen && detailLoading && (
                    <div style={{ padding: "14px 16px", borderTop: "1px solid var(--line)" }}>
                      <Spinner label={t("common.loading")} size={16} />
                    </div>
                  )}

                  {isOpen && detail && detail.id === e.id && !isEditingThis && (
                    <div style={styles.rolesPanel}>
                      {detail.roles.length === 0 && (
                        <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: 0 }}>
                          No roles yet.
                        </p>
                      )}
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
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ alignSelf: "flex-start", padding: "6px 14px", fontSize: "0.82rem" }}
                        onClick={startEditingRoles}
                      >
                        {detail.roles.length === 0
                          ? "+ " + t("admin.templates.addRole")
                          : t("admin.events.edit") + " " + t("admin.events.roles").toLowerCase()}
                      </button>
                    </div>
                  )}

                  {isEditingThis && (
                    <div style={styles.rolesPanel}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-dim)" }}>
                          {t("admin.review.template")}
                        </span>
                        <select defaultValue="" onChange={(ev) => applyTemplate(ev.target.value)}>
                          <option value="">{t("admin.review.none")}</option>
                          {templates.map((tp) => (
                            <option key={tp.id} value={tp.id}>
                              {tp.name_en}
                            </option>
                          ))}
                        </select>
                      </div>

                      {draftRoles.map((r, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            value={r.name_en}
                            onChange={(ev) => updateDraftRole(i, { name_en: ev.target.value })}
                            placeholder="Role (EN)"
                            style={{ flex: 1 }}
                          />
                          <input
                            value={r.name_zh}
                            onChange={(ev) => updateDraftRole(i, { name_zh: ev.target.value })}
                            placeholder="角色 (ZH)"
                            style={{ flex: 1 }}
                          />
                          <input
                            type="number"
                            min={1}
                            value={r.limit_count}
                            onChange={(ev) => updateDraftRole(i, { limit_count: Number(ev.target.value) })}
                            style={{ width: 64 }}
                          />
                          <button
                            type="button"
                            onClick={() => removeDraftRole(i)}
                            style={{ border: "none", background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ alignSelf: "flex-start", padding: "6px 14px", fontSize: "0.82rem" }}
                        onClick={addDraftRole}
                      >
                        + {t("admin.templates.addRole")}
                      </button>

                      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                        <button className="btn btn-gold" disabled={saving} onClick={saveRoles}>
                          {saving ? t("admin.review.saving") : t("admin.templates.save")}
                        </button>
                        <button className="btn btn-ghost" onClick={() => setEditing(false)}>
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "0 16px 8px",
    fontSize: "0.72rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-dim)",
  },
  headerCell: {
    display: "block",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
  },
  clickArea: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flex: 1,
    cursor: "pointer",
    minWidth: 0,
  },
  day: { fontFamily: "var(--font-mono)", fontWeight: 700, width: 24 },
  time: { fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--text-dim)", width: 56 },
  name: { flex: 1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  roleCount: { fontSize: "0.8rem", color: "var(--text-dim)", width: 40 },
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
