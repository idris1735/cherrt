"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/** Reads admin-kit CSS tokens live so charts follow light/dark theme. */
function useThemeTokens() {
  const [tokens, setTokens] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      setTokens({
        ink: cs.getPropertyValue("--ink").trim() || "#171717",
        muted: cs.getPropertyValue("--muted").trim() || "#737373",
        line: cs.getPropertyValue("--line").trim() || "#ebebeb",
        accent: cs.getPropertyValue("--accent").trim() || "#fa8300",
        surface: cs.getPropertyValue("--surface").trim() || "#ffffff",
      });
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-chertt-theme"] });
    return () => mo.disconnect();
  }, []);
  return tokens;
}

const FALLBACK = { ink: "#171717", muted: "#737373", line: "#ebebeb", accent: "#fa8300", surface: "#ffffff" };

const tooltipStyle = (surface: string, ink: string, line: string): CSSProperties => ({
  background: surface,
  border: `1px solid ${line}`,
  borderRadius: 10,
  fontSize: 12,
  color: ink,
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
  padding: "8px 12px",
});

/** Tiny inline SVG sparkline for KPI cards — real series data, no lib overhead. */
export function Sparkline({ data, color, height = 36 }: { data: number[]; color?: string; height?: number }) {
  const tokens = useThemeTokens();
  const stroke = color ?? tokens?.accent ?? FALLBACK.accent;
  const w = 120;
  const h = height;
  const pts = useMemo(() => {
    if (!data.length) return "";
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const span = max - min || 1;
    return data
      .map((v, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * w;
        const y = h - 4 - ((v - min) / span) * (h - 8);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [data, w, h]);
  if (!data.length) return <svg width={w} height={h} aria-hidden="true" />;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" style={{ display: "block" }}>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={stroke} opacity={0.12} />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function GrowthChart({ data }: { data: { bucket: string; churches: number; members: number }[] }) {
  const tokens = useThemeTokens();
  const t = tokens ?? FALLBACK;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gChurches" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.accent} stopOpacity={0.25} />
            <stop offset="100%" stopColor={t.accent} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gMembers" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={t.line} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: t.muted }} tickLine={false} axisLine={{ stroke: t.line }} minTickGap={24} />
        <YAxis tick={{ fontSize: 11, fill: t.muted }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle(t.surface, t.ink, t.line)} />
        <Area type="monotone" dataKey="churches" name="Churches" stroke={t.accent} strokeWidth={2} fill="url(#gChurches)" />
        <Area type="monotone" dataKey="members" name="Members" stroke="#3b82f6" strokeWidth={2} fill="url(#gMembers)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GivingChart({ data }: { data: { bucket: string; amount: number }[] }) {
  const tokens = useThemeTokens();
  const t = tokens ?? FALLBACK;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={t.line} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: t.muted }} tickLine={false} axisLine={{ stroke: t.line }} minTickGap={24} />
        <YAxis tick={{ fontSize: 11, fill: t.muted }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle(t.surface, t.ink, t.line)} formatter={(v) => [`₦${Number(v ?? 0).toLocaleString("en-NG")}`, "Giving"]} />
        <Bar dataKey="amount" name="Giving" fill={t.accent} radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MemberChart({ data }: { data: { bucket: string; members: number }[] }) {
  const tokens = useThemeTokens();
  const t = tokens ?? FALLBACK;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={t.line} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: t.muted }} tickLine={false} axisLine={{ stroke: t.line }} minTickGap={24} />
        <YAxis tick={{ fontSize: 11, fill: t.muted }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle(t.surface, t.ink, t.line)} />
        <Bar dataKey="members" name="New members" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** KYC funnel — counts per stage, ordered draft → rejected. Real counts only. */
export function FunnelChart({ data }: { data: { draft: number; pending: number; approved: number; rejected: number } }) {
  const tokens = useThemeTokens();
  const t = tokens ?? FALLBACK;
  const rows = [
    { stage: "Draft", count: data.draft, color: t.muted },
    { stage: "Pending", count: data.pending, color: "#e8a33d" },
    { stage: "Approved", count: data.approved, color: "#2e9e5b" },
    { stage: "Rejected", count: data.rejected, color: "#d94b4b" },
  ];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={t.line} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: t.muted }} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="stage" tick={{ fontSize: 12, fill: t.ink }} tickLine={false} axisLine={false} width={76} />
        <Tooltip contentStyle={tooltipStyle(t.surface, t.ink, t.line)} />
        <Bar dataKey="count" name="Applications" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {rows.map((r) => <Cell key={r.stage} fill={r.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Verification donut — L0/L1/L2 real people counts. */
export function VerificationDonut({ data }: { data: { l0: number; l1: number; l2: number } }) {
  const tokens = useThemeTokens();
  const t = tokens ?? FALLBACK;
  const rows = [
    { name: "L0 · Unverified", value: data.l0, color: t.muted },
    { name: "L1 · WhatsApp", value: data.l1, color: "#3b82f6" },
    { name: "L2 · KYC", value: data.l2, color: "#2e9e5b" },
  ].filter((r) => r.value > 0);
  if (!rows.length) return <div style={{ height: 240, display: "grid", placeItems: "center", color: t.muted, fontSize: 13 }}>No people yet</div>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={56} outerRadius={84} paddingAngle={3} strokeWidth={0}>
          {rows.map((r) => <Cell key={r.name} fill={r.color} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle(t.surface, t.ink, t.line)} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function PeriodSwitcher({ value, onChange }: { value: string; onChange: (p: "7d" | "30d" | "90d" | "all") => void }) {
  const options = ["7d", "30d", "90d", "all"] as const;
  return (
    <div role="group" aria-label="Period" style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          style={{
            padding: "5px 12px",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            background: value === o ? "var(--accent-soft, #fff4e8)" : "transparent",
            color: value === o ? "var(--accent)" : "var(--muted)",
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
