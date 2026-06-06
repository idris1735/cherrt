import type { BadgeTone } from "./status";

const TONE_LABELS: Record<BadgeTone, string> = {
  neutral: "Neutral",
  success: "Success",
  warning: "Warning",
  danger: "Danger",
  info: "Info",
};

type BadgeProps = {
  tone: BadgeTone;
  children: React.ReactNode;
};

export function Badge({ tone, children }: BadgeProps) {
  return (
    <span
      className={`ui-badge ui-badge--${tone}`}
      role="status"
      aria-label={TONE_LABELS[tone]}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "5px",
        fontSize: "0.72rem",
        fontWeight: 500,
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
        lineHeight: 1.4,
        ...(tone === "neutral"
          ? { background: "#f5f5f5", color: "#737373" }
          : tone === "success"
            ? { background: "#ecfdf5", color: "#059669" }
            : tone === "warning"
              ? { background: "var(--ds-accent-weak, #fff4e8)", color: "var(--ds-accent, #fa8300)" }
              : tone === "danger"
                ? { background: "#fef2f2", color: "#dc2626" }
                : { background: "#eff6ff", color: "#2563eb" }),
      }}
    >
      {children}
    </span>
  );
}
