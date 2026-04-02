import { PropsWithChildren } from "react";

export function MetricCard({
  label,
  value,
  note,
  children,
}: PropsWithChildren<{ label: string; value: string; note: string }>) {
  return (
    <article className="metric-card">
      <p className="metric-card__label">{label}</p>
      <strong className="metric-card__value">{value}</strong>
      <p className="metric-card__note">{note}</p>
      {children}
    </article>
  );
}
