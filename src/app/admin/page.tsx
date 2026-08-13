"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { GrowthChart, GivingChart, FunnelChart, VerificationDonut, Sparkline } from "@/components/admin/charts";
import { adminFetch } from "./use-admin-fetch";

type Kpi = { value: number; delta: number; spark: number[] };
type Overview = {
  churches: { total: number; active: number; pending: number };
  pendingKyc: number; members: number; people: { verified: number; unverified: number };
  kpis: { churches: Kpi; members: Kpi; giving: Kpi; verifiedPct: { value: number }; pendingKyc: { value: number } };
};
type TrendPoint = { bucket: string; churches: number; members: number; giving: number };
type Funnel = { draft: number; pending: number; approved: number; rejected: number };
type Verification = { l0: number; l1: number; l2: number };
type FeedEvent = { type: string; title: string; subtitle: string; at: string; href: string | null };

const nf = (n: number) => n.toLocaleString("en-NG");

function deltaChip(n: number) {
  const abs = Math.abs(n);
  const label = abs > 999 ? nf(abs) : String(abs);
  if (n > 0) return <span style={{ color: "var(--success)", fontSize: 12, fontWeight: 600 }}>▲ {label}</span>;
  if (n < 0) return <span style={{ color: "var(--danger)", fontSize: 12, fontWeight: 600 }}>▼ {label}</span>;
  return <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 600 }}>—</span>;
}

const FEED_ICON: Record<string, string> = {
  kyc_submitted: "📄", kyc_approved: "✓", kyc_rejected: "✕",
  church_created: "+", member_added: "👤", first_timer: "🌟", data_request: "🗑",
};

export default function AdminOverview() {
  const [o, setO] = useState<Overview | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [dataRequests, setDataRequests] = useState<{ id: string }[]>([]);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [err, setErr] = useState(false);

  const load = useCallback(async (p: "7d" | "30d" | "90d" | "all") => {
    adminFetch<{ overview: Overview; trends: TrendPoint[]; funnel: Funnel; verification: Verification; feed: FeedEvent[]; dataRequests?: { id: string }[] }>(`/api/admin/overview?period=${p}`).then((r) => {
      if (r.status === 401) setErr(true);
      else {
        setO(r.data?.overview ?? null);
        setTrends(r.data?.trends ?? []);
        setFunnel(r.data?.funnel ?? null);
        setVerification(r.data?.verification ?? null);
        setFeed(r.data?.feed ?? []);
        setDataRequests(r.data?.dataRequests ?? []);
      }
    });
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  if (err) return <div className="page"><div className="error-box">🔒 Not authorized — your account isn&apos;t on the Chertt review team.</div></div>;
  if (!o) return <div className="page"><div className="skeleton" style={{ height: 130, marginBottom: 16 }} /><div className="skeleton" style={{ height: 240 }} /></div>;

  const giving = trends.map((t) => ({ bucket: t.bucket, amount: t.giving }));
  const kpis = o.kpis;

  return (
    <div className="page animate-in">
      <div className="page-header">
        <div>
          <div className="breadcrumbs"><span>Platform</span><span className="sep">/</span><span>Overview</span></div>
          <h1>Command Center</h1>
        </div>
        <div className="flex items-center gap-2">
          {(["7d", "30d", "90d", "all"] as const).map((p) => (
            <button key={p} className={`btn ${p === period ? "btn-primary" : "btn-ghost"}`} style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      </div>

      {/* KPI row — fed by platformOverview.kpis (values, deltas vs previous window, real spark series) */}
      <div className="kpi-grid">
        {[
          { label: "Churches", value: nf(kpis.churches.value), delta: kpis.churches.delta, spark: kpis.churches.spark, color: "var(--accent)", href: "/admin/churches" },
          { label: "Members", value: nf(kpis.members.value), delta: kpis.members.delta, spark: kpis.members.spark, color: "var(--info)", href: "/admin/people" },
          { label: "Verified %", value: `${kpis.verifiedPct.value}%`, spark: kpis.members.spark, color: "var(--success)", href: "/admin/people" },
          { label: "Pending KYC", value: String(kpis.pendingKyc.value), spark: [], color: "var(--warning)", href: "/admin/kyc" },
          { label: "Giving (₦)", value: `₦${nf(kpis.giving.value)}`, delta: kpis.giving.delta, spark: kpis.giving.spark, color: "var(--accent)", href: "/admin/churches" },
        ].map((k) => (
          <Link key={k.label} href={k.href} className="card" style={{ padding: 16, cursor: "pointer", textDecoration: "none" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }} className="tabular">{k.value}</div>
            <div className="mt-2">{k.delta !== undefined && deltaChip(k.delta)}</div>
            <div className="mt-2"><Sparkline data={k.spark} color={k.color} height={40} /></div>
          </Link>
        ))}
      </div>

      <div className="charts-grid-2" style={{ marginBottom: 24 }}>
        <div className="flex-col" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-header"><h3>Growth</h3><span style={{ fontSize: 12, color: "var(--muted)" }}>New churches + members per {period === "7d" || period === "30d" ? "day" : "week"}</span></div>
            <div className="card-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Churches + members</div>
                  <GrowthChart data={trends} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Legend</div>
                  <div className="flex-col gap-2" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="flex items-center gap-2"><span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--accent)", display: "inline-block" }} /><span className="text-sm">Churches</span></div>
                    <div className="flex items-center gap-2"><span style={{ width: 10, height: 10, borderRadius: 3, background: "#3b82f6", display: "inline-block" }} /><span className="text-sm">Members</span></div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>Both series come from the live organizations / branch_memberships tables.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h3>Giving Trend</h3><span style={{ fontSize: 12, color: "var(--muted)" }}>Per {period === "7d" || period === "30d" ? "day" : "week"} (₦)</span></div>
            <div className="card-body"><GivingChart data={giving} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="card">
              <div className="card-header"><h3>KYC Funnel</h3></div>
              <div className="card-body"><FunnelChart data={funnel ?? { draft: 0, pending: 0, approved: 0, rejected: 0 }} /></div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Verification</h3></div>
              <div className="card-body"><VerificationDonut data={verification ?? { l0: 0, l1: 0, l2: 0 }} /></div>
            </div>
          </div>
        </div>

        <div className="flex-col" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card attention-pulse">
            <div className="card-header"><h3>Needs Attention</h3></div>
            <div className="card-body" style={{ padding: 0 }}>
              <Link href="/admin/kyc" style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div><div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>Pending KYC</div><div style={{ fontSize: 12, color: "var(--muted)" }}>Applications awaiting review</div></div>
                <span className="badge badge-warning">{o.pendingKyc}</span>
              </Link>
              <Link href="/admin/data-requests" style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div><div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>Open Data Requests</div><div style={{ fontSize: 12, color: "var(--muted)" }}>Privacy & deletion requests</div></div>
                <span className="badge badge-warning">{dataRequests.length}</span>
              </Link>
              <Link href="/admin/churches" style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div><div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>Unverified Churches</div><div style={{ fontSize: 12, color: "var(--muted)" }}>Pending approval</div></div>
                <span className="badge badge-danger">{o.churches.pending}</span>
              </Link>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3>Recent Activity</h3></div>
            <div className="card-body" style={{ padding: 0 }}>
              {feed.map((a, i) => {
                const inner = (
                  <>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{FEED_ICON[a.type] ?? "•"}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }} className="truncate">{a.title}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }} className="truncate">{a.subtitle}</div>
                      <div style={{ fontSize: 11, color: "var(--muted-light)", marginTop: 2 }}>{a.at.slice(0, 10)}</div>
                    </div>
                  </>
                );
                const rowStyle: React.CSSProperties = { padding: "12px 20px", borderBottom: "1px solid var(--line)", display: "flex", gap: 12, alignItems: "flex-start" };
                return a.href
                  ? <Link key={`${a.type}-${a.at}-${i}`} href={a.href} style={{ ...rowStyle, display: "flex" }}>{inner}</Link>
                  : <div key={`${a.type}-${a.at}-${i}`} style={rowStyle}>{inner}</div>;
              })}
              {feed.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-title">No activity yet</div>
                  <div className="empty-state-body">Events appear as churches onboard and members join.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
