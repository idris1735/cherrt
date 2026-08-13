"use client";
import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import s from "@/components/admin/admin-kit.module.css";
import { GivingChart, MemberChart, PeriodSwitcher } from "@/components/admin/charts";
import { adminFetch } from "../../use-admin-fetch";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Detail = {
  org: any;
  workspaces: { id: string; name: string; city: string | null }[];
  members: { name: string; role: string; level: 0 | 1 | 2; joinedAt: string; gender: string | null; birthdate: string | null; email: string | null; maritalStatus: string | null }[];
  children?: { name: string; guardian: string; relationship: string | null; allergies: string; medicalNotes: string; classroom: string }[];
  pastoralRequests?: { total: number; open: number; scheduled: number; resolved: number };
  pastoralCareRows?: { id: string; requesterName: string; category: string; details: string; status: string; createdAt: string }[];
  formSubmissions?: { id: string; formType: string; status: string; createdAt: string }[];
  kyc: { id: string; status: string } | null;
};
type Stats = { members: number; children: number; firstTimers: number; givingTotal: number; verifiedPct: number; pendingPastoral: number; branches: number };
type Series = { bucket: string; amount: number }[];
type MemberSeries = { bucket: string; members: number }[];

const LVL = ["Unverified", "WhatsApp-verified", "KYC-verified"];
const TABS = ["Overview", "Members", "Children", "Branches", "Pastoral", "KYC"] as const;
type Tab = (typeof TABS)[number];

function statusBadge(st: string) {
  if (st === "active") return s.badgeGreen;
  if (st === "rejected") return s.badgeRed;
  if (st.includes("pending")) return s.badgeAmber;
  return s.badgeNeutral;
}

export default function ChurchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [giving, setGiving] = useState<Series>([]);
  const [growth, setGrowth] = useState<MemberSeries>([]);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [tab, setTab] = useState<Tab>("Overview");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { adminFetch<{ church: Detail }>(`/api/admin/churches/${id}`).then((r) => { if (!r.data) setMsg("Not authorized or not found."); else setD(r.data.church); }); }, [id]);
  useEffect(() => {
    adminFetch<{ stats: Stats; giving: Series; growth: MemberSeries }>(`/api/admin/churches/${id}/stats?period=${period}`).then((r) => {
      if (r.data) { setStats(r.data.stats); setGiving(r.data.giving); setGrowth(r.data.growth); }
    });
  }, [id, period]);

  const members = useMemo(() => {
    if (!d || !q.trim()) return d?.members ?? [];
    const t = q.trim().toLowerCase();
    return d.members.filter((m) => m.name.toLowerCase().includes(t));
  }, [d, q]);

  if (msg) return <div className={s.errorBox}>{msg}</div>;
  if (!d) return <><div className={s.skeleton} style={{ height: 200, marginBottom: 16 }} /><div className={s.skeleton} style={{ height: 16, width: "40%" }} /></>;

  return (
    <>
      <div className={s.crumbs}>
        <Link className={s.crumbLink} href="/admin/churches">Churches</Link><span>/</span><span>{d.org.name}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 className={s.pageTitle} style={{ margin: 0 }}>{d.org.name} <span className={`${s.badge} ${statusBadge(d.org.status)}`}>{d.org.status}</span></h1>
        {d.kyc && <Link className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} href={`/admin/kyc/${d.kyc.id}`}>View KYC</Link>}
      </div>

      <div className={s.tabs} role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`${s.tab} ${tab === t ? s.tabActive : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Overview" && (
        <>
          {stats && (
            <div className={s.kpiGrid}>
              <div className={s.kpiCard} style={{ cursor: "default" }}><div className={s.kpiLabel}>Members</div><div className={s.kpiValue}>{stats.members}</div></div>
              <div className={s.kpiCard} style={{ cursor: "default" }}><div className={s.kpiLabel}>Children</div><div className={s.kpiValue}>{stats.children}</div></div>
              <div className={s.kpiCard} style={{ cursor: "default" }}><div className={s.kpiLabel}>First-timers</div><div className={s.kpiValue}>{stats.firstTimers}</div></div>
              <div className={s.kpiCard} style={{ cursor: "default" }}><div className={s.kpiLabel}>Giving total</div><div className={s.kpiValue}>₦{stats.givingTotal.toLocaleString("en-NG")}</div></div>
              <div className={s.kpiCard} style={{ cursor: "default" }}><div className={s.kpiLabel}>Verified</div><div className={s.kpiValue}>{stats.verifiedPct}%</div></div>
              <div className={s.kpiCard} style={{ cursor: "default" }}><div className={s.kpiLabel}>Open pastoral</div><div className={s.kpiValue}>{stats.pendingPastoral}</div></div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><PeriodSwitcher value={period} onChange={setPeriod} /></div>
          <div className={s.chartGrid}>
            <div className={s.card}><div className={s.cardBody}>
              <h2 className={s.chartTitle}>Giving trend</h2>
              <p className={s.chartSub}>Sum per {period === "7d" || period === "30d" ? "day" : "week"} — giving_records in this church&apos;s branches</p>
              <GivingChart data={giving} />
            </div></div>
            <div className={s.card}><div className={s.cardBody}>
              <h2 className={s.chartTitle}>Member growth</h2>
              <p className={s.chartSub}>New memberships per {period === "7d" || period === "30d" ? "day" : "week"} — branch_memberships</p>
              <MemberChart data={growth} />
            </div></div>
          </div>
          <div className={s.section}><div className={s.sectionTitle}>Details</div>
            <div className={s.card}><div className={s.cardBody}>
              <div className={s.kvGrid}>
                <span className={s.kvKey}>City</span><span>{d.org.requested_city ?? "—"}</span>
                <span className={s.kvKey}>Created</span><span>{d.org.created_at?.slice(0, 10) ?? "—"}</span>
                <span className={s.kvKey}>Approved by</span><span>{d.org.approved_by ?? "—"}</span>
                <span className={s.kvKey}>KYC</span><span>{d.kyc ? <Link style={{ color: "var(--accent)", textDecoration: "none" }} href={`/admin/kyc/${d.kyc.id}`}>{d.kyc.status}</Link> : "—"}</span>
              </div>
            </div></div>
          </div>
        </>
      )}

      {tab === "Members" && (
        <>
          <div className={s.toolbar}><input className={`${s.input} ${s.toolbarSearch}`} aria-label="Search members" placeholder="Search members…" value={q} onChange={(e) => setQ(e.target.value)} /><span className={s.toolbarSpacer} /><span className={s.feedTime}>{members.length} of {d.members.length}</span></div>
          <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
            <thead><tr><th>Name</th><th>Role</th><th>Gender</th><th>Email</th><th>Verification</th><th>Joined</th></tr></thead>
            <tbody>{members.map((m, i) => <tr key={i}><td style={{ fontWeight: 500 }}>{m.name}</td><td><span className={`${s.badge} ${s.badgeNeutral}`}>{m.role}</span></td><td>{m.gender ?? "—"}</td><td>{m.email ?? "—"}</td><td>{LVL[m.level]}</td><td>{m.joinedAt?.slice(0, 10)}</td></tr>)}
            {members.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>{d.members.length === 0 ? "No members yet." : "No members match."}</td></tr>}</tbody>
          </table></div></div>
        </>
      )}

      {tab === "Children" && (
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Name</th><th>Guardian</th><th>Relationship</th><th>Classroom</th><th>Allergies</th><th>Medical notes</th></tr></thead>
          <tbody>{(d.children ?? []).map((c, i) => <tr key={i}><td style={{ fontWeight: 500 }}>{c.name}</td><td>{c.guardian}</td><td>{c.relationship ?? "—"}</td><td>{c.classroom || "—"}</td><td>{c.allergies || "—"}</td><td>{c.medicalNotes || "—"}</td></tr>)}
          {(d.children ?? []).length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No children registered.</td></tr>}</tbody>
        </table></div></div>
      )}

      {tab === "Branches" && (
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Name</th><th>City</th></tr></thead>
          <tbody>{d.workspaces.map((w) => <tr key={w.id}><td style={{ fontWeight: 500 }}>{w.name}</td><td>{w.city ?? "—"}</td></tr>)}
          {d.workspaces.length === 0 && <tr><td colSpan={2} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No branches.</td></tr>}</tbody>
        </table></div></div>
      )}

      {tab === "Pastoral" && (
        <>
          <div className={s.kpiGrid}>
            <div className={s.kpiCard} style={{ cursor: "default" }}><div className={s.kpiLabel}>Requests</div><div className={s.kpiValue}>{d.pastoralRequests?.total ?? 0}</div></div>
            <div className={s.kpiCard} style={{ cursor: "default" }}><div className={s.kpiLabel}>Open</div><div className={s.kpiValue}>{d.pastoralRequests?.open ?? 0}</div></div>
            <div className={s.kpiCard} style={{ cursor: "default" }}><div className={s.kpiLabel}>Scheduled</div><div className={s.kpiValue}>{d.pastoralRequests?.scheduled ?? 0}</div></div>
            <div className={s.kpiCard} style={{ cursor: "default" }}><div className={s.kpiLabel}>Resolved</div><div className={s.kpiValue}>{d.pastoralRequests?.resolved ?? 0}</div></div>
          </div>
          <div className={s.section}><div className={s.sectionTitle}>Care requests</div>
            <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
              <thead><tr><th>From</th><th>Category</th><th>Details</th><th>Status</th><th>When</th></tr></thead>
              <tbody>{(d.pastoralCareRows ?? []).map((r) => <tr key={r.id}><td>{r.requesterName || "—"}</td><td>{r.category}</td><td>{r.details || "—"}</td><td><span className={`${s.badge} ${r.status === "resolved" ? s.badgeGreen : r.status === "open" ? s.badgeAmber : s.badgeNeutral}`}>{r.status}</span></td><td>{r.createdAt?.slice(0, 10)}</td></tr>)}
              {(d.pastoralCareRows ?? []).length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No care requests.</td></tr>}</tbody>
            </table></div></div>
          </div>
          <div className={s.section}><div className={s.sectionTitle}>Form submissions</div>
            <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
              <thead><tr><th>Form</th><th>Status</th><th>When</th></tr></thead>
              <tbody>{(d.formSubmissions ?? []).map((f) => <tr key={f.id}><td>{f.formType.replace(/_/g, " ")}</td><td><span className={`${s.badge} ${f.status === "completed" ? s.badgeGreen : s.badgeAmber}`}>{f.status}</span></td><td>{f.createdAt?.slice(0, 10)}</td></tr>)}
              {(d.formSubmissions ?? []).length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No form submissions.</td></tr>}</tbody>
            </table></div></div>
          </div>
        </>
      )}

      {tab === "KYC" && (
        <div className={s.card}><div className={s.cardBody}>
          {d.kyc ? (
            <div className={s.kvGrid}>
              <span className={s.kvKey}>Status</span><span><span className={`${s.badge} ${statusBadge(d.kyc.status)}`}>{d.kyc.status}</span></span>
              <span className={s.kvKey}>Review</span><span><Link style={{ color: "var(--accent)", textDecoration: "none" }} href={`/admin/kyc/${d.kyc.id}`}>Open the review screen →</Link></span>
            </div>
          ) : (
            <div className={s.emptyState}><div className={s.emptyStateTitle}>No KYC application</div><div className={s.emptyStateBody}>This church was added outside the KYC flow.</div></div>
          )}
        </div></div>
      )}
    </>
  );
}
