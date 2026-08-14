import React from "react";
import { NavLink } from "react-router-dom";
import { useI18n } from "../i18n";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Nav() {
  const { t } = useI18n();
  return (
    <header style={styles.header}>
      <div className="container nav-inner" style={styles.inner}>
        <NavLink to="/" style={styles.brand}>
          <img src="/logo-wheel.png" alt="" style={styles.mark} />
          <span className="nav-title" style={styles.title}>
            {t("app.title")}
          </span>
        </NavLink>
        <nav className="nav-links" style={styles.nav}>
          <NavLink to="/" end style={({ isActive }) => linkStyle(isActive)}>
            {t("nav.calendar")}
          </NavLink>
          <NavLink to="/admin" style={({ isActive }) => linkStyle(isActive)}>
            {t("nav.admin")}
          </NavLink>
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}

function linkStyle(isActive) {
  return {
    color: isActive ? "var(--ink)" : "var(--text-dim)",
    fontWeight: isActive ? 700 : 500,
    textDecoration: "none",
    fontSize: "0.92rem",
    borderBottom: isActive ? "2px solid var(--gold)" : "2px solid transparent",
    paddingBottom: 4,
  };
}

const styles = {
  header: {
    borderBottom: "1px solid var(--line)",
    background: "var(--paper)",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },
  inner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 64,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    color: "var(--ink)",
  },
  mark: {
    width: 30,
    height: 30,
    objectFit: "contain",
    flexShrink: 0,
  },
  title: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: "1.15rem",
    letterSpacing: "0.01em",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    gap: 22,
  },
};
