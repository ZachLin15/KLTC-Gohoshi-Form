import React, { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";

export default function AdminLogin({ onLoggedIn }) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.adminLogin(password);
      onLoggedIn();
    } catch {
      setError(t("admin.wrongPassword"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "60px auto 0" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
        <img src="/logo-shinnyo.png" alt="Shinnyo" style={{ height: 44, objectFit: "contain" }} />
      </div>
      <form onSubmit={submit} className="card" style={{ padding: 28 }}>
        <h2 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>
          {t("admin.loginTitle")}
        </h2>
        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>
          {t("admin.password")}
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%" }}
          autoFocus
        />
        {error && <div style={{ color: "#b3453f", fontSize: "0.85rem", marginTop: 8 }}>{error}</div>}
        <button className="btn btn-gold" disabled={loading} style={{ marginTop: 16, width: "100%" }}>
          {t("admin.signIn")}
        </button>
      </form>
    </div>
  );
}
