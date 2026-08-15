import React, { useEffect, useState } from "react";
import { useI18n } from "../i18n";

const DISMISS_KEY = "kltc_a2hs_dismissed_at";
const DISMISS_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // don't re-nag for 14 days after a dismiss

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true // iOS Safari's own flag
  );
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function wasRecentlyDismissed() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  return Date.now() - Number(raw) < DISMISS_SNOOZE_MS;
}

export default function InstallPrompt() {
  const { t } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState(null); // 'android' | 'ios'

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    if (isIOS()) {
      // iOS Safari has no install-prompt API at all — Apple only allows the
      // user to do this manually via the Share sheet, so the best we can do
      // is show our own instructions pointing them to it.
      setPlatform("ios");
      setVisible(true);
      return;
    }

    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform("android");
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice; // resolves once the user accepts/dismisses the native prompt
    setDeferredPrompt(null);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div style={styles.banner} role="dialog" aria-label={t("install.title")}>
      <img src="/icon-192.png" alt="" style={styles.icon} />
      <div style={styles.textCol}>
        <div style={styles.title}>{t("install.title")}</div>
        {platform === "ios" ? (
          <div style={styles.body}>{t("install.iosInstructions")}</div>
        ) : (
          <div style={styles.body}>{t("install.body")}</div>
        )}
      </div>
      <div style={styles.actions}>
        {platform === "android" && (
          <button className="btn btn-gold" style={styles.installBtn} onClick={handleInstallClick}>
            {t("install.addButton")}
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label={t("install.dismiss")}
          style={styles.closeBtn}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

const styles = {
  banner: {
    position: "fixed",
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 60,
    background: "#232b45",
    color: "#fbf9f4",
    borderRadius: 14,
    padding: "12px 12px 12px 14px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 12px 32px rgba(35,43,69,0.35)",
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: "0.92rem",
    marginBottom: 2,
  },
  body: {
    fontSize: "0.78rem",
    color: "rgba(251,249,244,0.8)",
    lineHeight: 1.4,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  installBtn: {
    padding: "8px 14px",
    fontSize: "0.82rem",
    whiteSpace: "nowrap",
  },
  closeBtn: {
    border: "none",
    background: "rgba(255,255,255,0.12)",
    color: "#fbf9f4",
    borderRadius: "50%",
    width: 28,
    height: 28,
    cursor: "pointer",
    fontSize: "0.8rem",
    flexShrink: 0,
  },
};
