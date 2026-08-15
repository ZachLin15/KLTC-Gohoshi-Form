import React, { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { colorVars } from "../lib/colors";

export default function EventModal({ event: initialEvent, onClose, monthLabel }) {
  const { t, pickLang, locale } = useI18n();
  const [event, setEvent] = useState(initialEvent);
  const [selectedRole, setSelectedRole] = useState(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [roleError, setRoleError] = useState("");

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    if (!selectedRole || !name.trim()) return;
    setSubmitting(true);
    setRoleError("");
    try {
      const res = await api.signUp(event.id, selectedRole.id, name.trim());
      setEvent((prev) => ({ ...prev, roles: res.roles }));
      setSuccess({ role: selectedRole, name: name.trim() });
    } catch (e) {
      if (e.code === "DUPLICATE") setRoleError(t("event.errorDuplicate"));
      else if (e.code === "FULL") {
        setRoleError(t("event.errorFull"));
        // refresh counts — this is the one case where a fresh fetch is
        // worth it, since the displayed count was just proven stale
        api.getEvent(event.id).then(setEvent).catch(() => {});
        setSelectedRole(null);
      } else setRoleError(t("event.errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  const colors = colorVars(event.color);

  return (
    <div style={styles.overlay} onMouseDown={onClose}>
      <div
        style={styles.panel}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div style={{ ...styles.header, background: colors.bg, borderColor: colors.line }}>
          <div style={styles.headerMeta}>
            {monthLabel} {event.day} · {event.time}
          </div>
          <div style={styles.headerTitle}>{pickLang(event, "name")}</div>
          {locale !== "en" && event.name_en && pickLang(event, "name") !== event.name_en && (
            <div style={styles.headerSub}>{event.name_en}</div>
          )}
        </div>

        <button onClick={onClose} aria-label={t("event.close")} style={styles.closeBtn}>
          ✕
        </button>

        <div style={styles.body}>
          {success ? (
            <div style={styles.success}>
              <div style={styles.successIcon}>✓</div>
              <div style={styles.successTitle}>{t("event.successTitle")}</div>
              <div style={styles.successBody}>
                {t("event.successBody", {
                  role: pickLang(success.role, "name"),
                  date: `${monthLabel} ${event.day}`,
                })}
              </div>
              <button className="btn btn-ghost" onClick={onClose} style={{ marginTop: 16 }}>
                {t("event.close")}
              </button>
            </div>
          ) : !event.needs_signup || event.roles.length === 0 ? (
            <p style={{ color: "var(--text-dim)" }}>{t("event.noRoles")}</p>
          ) : (
            <form onSubmit={submit}>
              <h3 style={styles.rolesTitle}>{t("event.rolesTitle")}</h3>
              <div style={styles.roleList}>
                {event.roles.map((r) => {
                  const spotsLeft = r.limit_count - r.signup_count;
                  const isFull = spotsLeft <= 0;
                  const isSelected = selectedRole && selectedRole.id === r.id;
                  return (
                    <button
                      type="button"
                      key={r.id}
                      disabled={isFull}
                      onClick={() => {
                        setSelectedRole(r);
                        setRoleError("");
                      }}
                      style={{
                        ...styles.roleRow,
                        ...(isSelected ? styles.roleRowSelected : {}),
                        ...(isFull ? styles.roleRowFull : {}),
                      }}
                    >
                      <div style={styles.roleDots} aria-hidden="true">
                        {Array.from({ length: r.limit_count }).map((_, i) => (
                          <span
                            key={i}
                            style={{
                              ...styles.dot,
                              background: i < r.signup_count ? "var(--ink-soft)" : "var(--line)",
                            }}
                          />
                        ))}
                      </div>
                      <span style={styles.roleName}>{pickLang(r, "name")}</span>
                      <span style={styles.roleCount}>
                        {isFull ? t("event.full") : `${spotsLeft} ${t("event.spotsLeft")}`}
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedRole && (
                <div style={styles.nameSection}>
                  <label style={styles.label} htmlFor="signup-name">
                    {t("event.yourName")}
                  </label>
                  <input
                    id="signup-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("event.namePlaceholder")}
                    style={{ width: "100%" }}
                    autoFocus
                    maxLength={80}
                  />
                  {roleError && <div style={styles.errorText}>{roleError}</div>}
                  <button
                    type="submit"
                    className="btn btn-gold"
                    disabled={submitting || !name.trim()}
                    style={{ marginTop: 12, width: "100%" }}
                  >
                    {submitting ? t("event.signingUp") : t("event.signUp")}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(35,43,69,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  panel: {
    background: "#fff",
    borderRadius: "var(--radius-l)",
    width: "100%",
    maxWidth: 460,
    maxHeight: "88vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    boxShadow: "0 24px 60px rgba(35,43,69,0.28)",
  },
  header: {
    padding: "22px 28px",
    borderBottom: "3px solid",
  },
  headerMeta: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "rgba(35,43,69,0.75)",
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: "var(--font-display)",
    fontSize: "1.3rem",
    fontWeight: 600,
    color: "var(--ink)",
    lineHeight: 1.3,
  },
  headerSub: {
    fontSize: "0.88rem",
    color: "rgba(35,43,69,0.7)",
    marginTop: 4,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    border: "none",
    background: "rgba(255,255,255,0.6)",
    borderRadius: "50%",
    width: 32,
    height: 32,
    cursor: "pointer",
    fontSize: "0.9rem",
    color: "var(--ink)",
  },
  body: {
    padding: 24,
    overflowY: "auto",
  },
  rolesTitle: {
    fontFamily: "var(--font-display)",
    fontSize: "1rem",
    margin: "0 0 12px",
    color: "var(--ink)",
  },
  roleList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  roleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: "var(--radius-s)",
    border: "1px solid var(--line)",
    background: "#fff",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  },
  roleRowSelected: {
    borderColor: "var(--gold)",
    background: "#fbf3e2",
  },
  roleRowFull: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  roleDots: {
    display: "flex",
    gap: 3,
    flexShrink: 0,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
  },
  roleName: {
    flex: 1,
    fontSize: "0.92rem",
    fontWeight: 500,
    color: "var(--text)",
  },
  roleCount: {
    fontSize: "0.78rem",
    color: "var(--text-dim)",
    fontFamily: "var(--font-mono)",
    whiteSpace: "nowrap",
  },
  nameSection: {
    marginTop: 20,
    borderTop: "1px solid var(--line)",
    paddingTop: 18,
  },
  label: {
    display: "block",
    fontSize: "0.85rem",
    fontWeight: 600,
    marginBottom: 6,
    color: "var(--ink)",
  },
  errorText: {
    color: "#b3453f",
    fontSize: "0.85rem",
    marginTop: 8,
  },
  success: {
    textAlign: "center",
    padding: "12px 0",
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    background: "var(--c-green)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.4rem",
    margin: "0 auto 14px",
  },
  successTitle: {
    fontFamily: "var(--font-display)",
    fontSize: "1.15rem",
    fontWeight: 600,
    marginBottom: 6,
  },
  successBody: {
    color: "var(--text-dim)",
    fontSize: "0.92rem",
  },
};
