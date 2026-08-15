import React from "react";

export default function Spinner({ label, size = 22, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, ...style }}>
      <span
        style={{
          width: size,
          height: size,
          border: "2.5px solid var(--line)",
          borderTopColor: "var(--gold)",
          borderRadius: "50%",
          display: "inline-block",
          animation: "kltc-spin 0.7s linear infinite",
          flexShrink: 0,
        }}
      />
      {label && <span style={{ color: "var(--text-dim)", fontSize: "0.88rem" }}>{label}</span>}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "48px 0",
      }}
    >
      <Spinner label={label} />
    </div>
  );
}
