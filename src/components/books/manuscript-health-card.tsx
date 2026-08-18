"use client";

export type HealthPill = { label: string; tone: "ok" | "warn" | "neutral" };

export function Pill({ label, tone }: HealthPill) {
  const palette =
    tone === "warn"
      ? { bg: "oklch(0.95 0.06 45)", color: "oklch(0.5 0.12 45)" }
      : tone === "neutral"
        ? { bg: "oklch(0.96 0.003 90)", color: "oklch(0.5 0.005 90)" }
        : { bg: "oklch(0.94 0.05 165)", color: "oklch(0.4 0.1 165)" };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.02em",
        padding: "4px 10px",
        borderRadius: 6,
        background: palette.bg,
        color: palette.color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function ManuscriptHealthCard({
  icon,
  title,
  description,
  pills,
  actionLabel,
  onAction,
  warning,
}: {
  icon: string;
  title: string;
  description: string;
  pills: HealthPill[];
  actionLabel: string;
  onAction: () => void;
  warning?: boolean;
}) {
  const accentColor = warning ? "oklch(0.65 0.13 70)" : "oklch(0.6 0.13 165)";
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid oklch(0.92 0.003 90)",
        borderTop: `3px solid ${accentColor}`,
        borderRadius: 12,
        padding: 22,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        height: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          borderRadius: 10,
          background: "oklch(0.95 0.05 165)",
          fontSize: 20,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "oklch(0.2 0.005 90)" }}>{title}</div>
        <div style={{ fontSize: 13, color: "oklch(0.5 0.005 90)", marginTop: 4, lineHeight: 1.5 }}>{description}</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {pills.map((pill) => (
          <Pill key={pill.label} label={pill.label} tone={pill.tone} />
        ))}
      </div>
      <button
        type="button"
        onClick={onAction}
        style={{
          background: "#fff",
          color: "oklch(0.35 0.005 90)",
          border: "1px solid oklch(0.85 0.005 90)",
          padding: "9px 16px",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
          marginTop: "auto",
          alignSelf: "flex-start",
        }}
      >
        {actionLabel}
      </button>
    </div>
  );
}
