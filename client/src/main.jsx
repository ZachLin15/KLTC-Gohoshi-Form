import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { I18nProvider } from "./i18n";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>
);

// register the service worker for cache-first assets + stale-while-revalidate
// API responses — makes repeat visits feel instant. Registered after load so
// it never competes with the initial page render for bandwidth/CPU.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // non-fatal — app works fine without it, just without the repeat-visit speedup
    });
  });
}
