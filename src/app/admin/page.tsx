"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import s from "@/components/admin/admin-kit.module.css";
import { GrowthChart, GivingChart, FunnelChart, VerificationDonut, Sparkline, PeriodSwitcher } from "@/components/admin/charts";
import { adminFetch } from "./use-admin-fetch";

type Kpi = { value: number; delta: number; spark: number[] };
type Overview = {
  churches: { total: number; active: number; pending: number };
  pendingKyc: number; members: number; people: { verified: number; unverified: number };
  recentKyc: { id: string; church: string; status: string; createdAt: string }[];
  recentChurches: { id: string; name: string; status: string; createdAt: string }[];
  kpis: { churches: Kpi; members: Kpi; giving: Kpi; verifiedPct: { value: number }; pendingKyc: { value: number } };
};
type TrendPoint = { bucket: string; churches: number; members: number; giving: number };
type Funnel = { draft: number; pending: number; approved: number; rejected: number };
type Verification = { l0: number; l1: number; l2: number };
type FeedEvent = { type: string; title: string; subtitle: string; at: string; href: string | null };
type DataRequest = { id: string; kind: string; status: string; note: string; personName: string; createdAt: string };

const nf = (n: number) => n.toLocaleString("en-NG");

function deltaChip(d: number) {
  if (d > 0) return <span className={`${s.delta} ${s.deltaUp}`}>▲ {d > 999 ? nf(d) : d}</span>;
  if (d < 0) return <span className={`${s.delta} ${s.deltaDown}`}>▼ {Math.abs(d) > 999 ? nf(Math.abs(d)) : Math.abs(d)}</span>;
  return <span className={`${s.delta} ${s.deltaFlat}`}>—</span>;
}

function KpiCard({ label, value, delta, spark, href, format }: { label: string; value: number; delta?: number; spark: number[]; href: string; format?: (n: number) => string }) {
  return (
    <Link className={s.kpiCard} href={href}>
      <div className={s.kpiLabel}><span>{label}</span>{delta !== undefined && deltaChip(delta)}</div>
      <div className={s.kpiValue}>{format ? format(value) : nf(value)}</div>
      <div className={s.kpiFoot}><div className={s.kpiSpark}><Sparkline data={spark} /></div><span className={s.feedTime}>↗</span></div>
    </Link>
  );
}

export default function AdminOverview() {
  const [o, setO] = useState<Overview | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [dataRequests, setDataRequests] = useState<DataRequest[]>([]);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [err, setErr] = useState(false);

  const load = useCallback(async (p: "7d" | "30d" | "90d" | "all") => {
    adminFetch<{ overview: Overview; trends: TrendPoint[]; funnel: Funnel; verification: Verification; feed: FeedEvent[]; dataRequests?: DataRequest[] }>(`/api/admin/overview?period=${p}`).then((r) => {
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

  if (err) return <div className={s.errorBox}>🔒 Not authorized — your account isn&apos;t on the Chertt review team.</div>;
  if (!o) return <><div className={s.skeleton} style={{ height: 130, marginBottom: 16 }} /><div className={s.skeleton} style={{ height: 240, marginBottom: 16 }} /><div className={s.skeleton} style={{ height: 16, width: "40%" }} /></>;

  const giving = trends.map((t) => ({ bucket: t.bucket, amount: t.giving }));

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className={s.pageTitle}>Overview</h1>
          <p className={s.pageSub} style={{ marginBottom: 0 }}>The platform at a glance — every number traces to a live query.</p>
        </div>
        <PeriodSwitcher value={period} onChange={setPeriod} />
      </div>

      {/* KPI row — sparklines fed by platformTrends, deltas = this period vs previous */}
      <div style={{ marginTop: 20 }}>
        <div className={s.kpiGrid}>
          <KpiCard label="Churches" value={o.kpis.churches.value} delta={o.kpis.churches.delta} spark={o.kpis.churches.spark} href="/admin/churches" />
          <KpiCard label="Members" value={o.kpis.members.value} delta={o.kpis.members.delta} spark={o.kpis.members.spark} href="/admin/people" />
          <KpiCard label={`Giving · ${period}`} value={o.kpis.giving.value} delta={o.kpis.giving.delta} spark={o.kpis.giving.spark} href="/admin/churches" format={(n) => `₦${nf(n)}`} />
          <KpiCard label="Verified %" value={o.kpis.verifiedPct.value} spark={[]} href="/admin/people" format={(n) => `${n}%`} />
          <KpiCard label="Pending KYC" value={o.kpis.pendingKyc.value} spark={[]} href="/admin/kyc" />
        </div>
      </div>

      {/* Attention panel — jump straight to the work */}
      <div className={s.attentionGrid}>
        <Link className={s.attentionCard} href="/admin/kyc">
          <span className={s.attentionIcon}>🛡️</span>
          <div><div className={s.attentionCount}>{o.pendingKyc}</div><div className={s.attentionLabel}>KYC awaiting review</div></div>
        </Link>
        <div className={s.attentionCard}>
          <span className={s.attentionIcon}>🔒</span>
          <div><div className={s.attentionCount}>{dataRequests.length}</div><div className={s.attentionLabel}>Open data requests</div></div>
        </div>
        <Link className={s.attentionCard} href="/admin/churches">
          <span className={s.attentionIcon}>⏳</span>
          <div><div className={s.attentionCount}>{o.churches.pending}</div><div className={s.attentionLabel}>Unverified churches</div></div>
        </Link>
      </div>

      {/* Charts — every series fed by real queries */}
      <div className={s.chartGrid}>
        <div className={s.card}>
          <div className={s.cardBody}>
            <h2 className={s.chartTitle}>Growth</h2>
            <p className={s.chartSub}>New churches and members per {period === "7d" || period === "30d" ? "day" : "week"} — organizations + branch_memberships</p>
            <GrowthChart data={trends} />
          </div>
        </div>
        <div className={s.card}>
          <div className={s.cardBody}>
            <h2 className={s.chartTitle}>Giving</h2>
            <p className={s.chartSub}>Total received per {period === "7d" || period === "30d" ? "day" : "week"} — giving_records</p>
            <GivingChart data={giving} />
          </div>
        </div>
      </div>

      <div className={s.chartGridThree}>
        <div className={s.card}>
          <div className={s.cardBody}>
            <h2 className={s.chartTitle}>KYC funnel</h2>
            <p className={s.chartSub}>Applications by stage — kyc_applications</p>
            <FunnelChart data={funnel ?? { draft: 0, pending: 0, approved: 0, rejected: 0 }} />
          </div>
        </div>
        <div className={s.card}>
          <div className={s.cardBody}>
            <h2 className={s.chartTitle}>Verification</h2>
            <p className={s.chartSub}>People by level — phone_contacts + consent stamps</p>
            <VerificationDonut data={verification ?? { l0: 0, l1: 0, l2: 0 }} />
            <div className={s.donutLegend}>
              <span><span className={s.donutDot} style={{ background: "var(--muted)" }} />L0 · Unverified</span>
              <span><span className={s.donutDot} style={{ background: "#3b82f6" }} />L1 · WhatsApp</span>
              <span><span className={s.donutDot} style={{ background: "#2e9e5b" }} />L2 · KYC</span>
            </div>
          </div>
        </div>
        <div className={s.card}>
          <div className={s.cardHead}>Live activity</div>
          <div className={s.feedList}>
            {feed.map((e, i) => <FeedRow key={`${e.type}-${e.at}-${i}`} e={e} />)}
            {feed.length === 0 && <div className={s.emptyState}><div className={s.emptyStateTitle}>No activity yet</div><div className={s.emptyStateBody}>Events appear as churches onboard and members join.</div></div>}
          </div>
        </div>
      </div>

      {/* Open data requests — platform team action list */}
      <div className={s.section}>
        <div className={s.sectionTitle}>Privacy: open data requests</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Type</th><th>Person</th><th>Note</th><th>When</th><th /></tr></thead>
          <tbody>
            {dataRequests.map((d) => <tr key={d.id}>
              <td><span className={`${s.badge} ${d.kind === "deletion" ? s.badgeRed : d.kind === "access" ? s.badgeGreen : s.badgeAmber}`}>{d.kind}</span></td>
              <td>{d.personName}</td>
              <td>{d.note}</td>
              <td>{d.createdAt?.slice(0, 10)}</td>
              <td style={{ textAlign: "right" }}>
                <button className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={async () => {
                  const r = await adminFetch<{ ok: boolean }>(`/api/admin/data-requests/${d.id}`, { method: "POST" });
                  if (r.data?.ok) setDataRequests((xs) => xs.filter((x) => x.id !== d.id));
                }}>Done</button>
              </td>
            </tr>)}
            {dataRequests.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No open requests. 🎉</td></tr>}
          </tbody>
        </table></div></div>
      </div>
    </>
  );
}

function FeedRow({ e }: { e: FeedEvent }) {
  const inner = (
    <>
      <span className={s.feedDot} />
      <span className={s.feedTitle}>{e.title}</span>
      {e.subtitle && <span className={s.feedSub}>{e.subtitle}</span>}
      <span className={s.feedTime}>{e.at.slice(0, 10)}</span>
    </>
  );
  return e.href ? <Link className={s.feedRow} href={e.href}>{inner}</Link> : <div className={s.feedRow}>{inner}</div>;
}
