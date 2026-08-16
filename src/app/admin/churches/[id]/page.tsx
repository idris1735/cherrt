"use client";
import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { GivingChart, MemberChart } from "@/components/admin/charts";
import { adminFetch } from "../../use-admin-fetch";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Detail = {
  org: any;
  workspaces: { id: string; name: string; city: string | null; username: string | null; website: string | null }[];
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

const nf = (n: number) => n.toLocaleString("en-NG");

function statusBadge(st: string) {
  if (st === "active") return "badge-success";
  if (st === "rejected") return "badge-danger";
  if (st.includes("pending")) return "badge-warning";
  return "badge-muted";
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

  if (msg) return <div className="page"><div className="error-box">{msg}</div></div>;
  if (!d) return <div className="page"><div className="skeleton" style={{ height: 200, marginBottom: 16 }} /><div className="skeleton" style={{ height: 16, width: "40%" }} /></div>;

  return (
    <div className="page animate-in">
      <div className="page-header">
        <div>
          <div className="breadcrumbs">
            <span>Platform</span><span className="sep">/</span>
            <Link href="/admin/churches">Churches</Link><span className="sep">/</span><span>{d.org.name}</span>
          </div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {d.org.name} <span className={`badge ${statusBadge(d.org.status)}`}>{d.org.status.replace(/_/g, " ")}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {d.kyc && <Link className="btn btn-sm" href={`/admin/kyc/${d.kyc.id}`}>View KYC</Link>}
          <Link className="btn btn-sm" href="/admin/churches">Back</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 16 }}><div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Members</div><div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }} className="tabular mt-2">{nf(stats?.members ?? d.members.length)}</div></div>
        <div className="card" style={{ padding: 16 }}><div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Branches</div><div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }} className="tabular mt-2">{stats?.branches ?? d.workspaces.length}</div></div>
        <div className="card" style={{ padding: 16 }}><div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Verified</div><div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }} className="tabular mt-2">{stats?.verifiedPct ?? 0}%</div></div>
        <div className="card" style={{ padding: 16 }}><div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Giving</div><div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }} className="tabular mt-2">₦{nf(stats?.givingTotal ?? 0)}</div></div>
      </div>

      <div className="card">
        <div className="tabs">
          {TABS.map((t) => <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}{t === "Members" ? ` (${d.members.length})` : ""}{t === "Children" ? ` (${d.children?.length ?? 0})` : ""}</button>)}
        </div>

        {tab === "Overview" && (
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <div className="flex items-center gap-2">
                {(["7d", "30d", "90d", "all"] as const).map((p) => (
                  <button key={p} className={`btn ${p === period ? "btn-primary" : "btn-ghost"}`} style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setPeriod(p)}>{p}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Member Growth — branch_memberships per {period === "7d" || period === "30d" ? "day" : "week"}</div>
                <MemberChart data={growth} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Giving Trend — giving_records per {period === "7d" || period === "30d" ? "day" : "week"}</div>
                <GivingChart data={giving} />
              </div>
            </div>
            <div className="mt-4">
              <h4 style={{ marginBottom: 12 }}>Details</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                <div style={{ padding: 12, background: "var(--surface-muted)", borderRadius: "var(--radius-sm)" }}><div style={{ fontSize: 11, color: "var(--muted)" }}>City</div><div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{d.org.requested_city ?? "—"}</div></div>
                <div style={{ padding: 12, background: "var(--surface-muted)", borderRadius: "var(--radius-sm)" }}><div style={{ fontSize: 11, color: "var(--muted)" }}>Username</div><div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{d.workspaces[0]?.username ? `@${d.workspaces[0].username}` : "—"}</div></div>
                <div style={{ padding: 12, background: "var(--surface-muted)", borderRadius: "var(--radius-sm)" }}><div style={{ fontSize: 11, color: "var(--muted)" }}>Website</div><div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{d.workspaces[0]?.website ?? "—"}</div></div>
                <div style={{ padding: 12, background: "var(--surface-muted)", borderRadius: "var(--radius-sm)" }}><div style={{ fontSize: 11, color: "var(--muted)" }}>Created</div><div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{d.org.created_at?.slice(0, 10) ?? "—"}</div></div>
                <div style={{ padding: 12, background: "var(--surface-muted)", borderRadius: "var(--radius-sm)" }}><div style={{ fontSize: 11, color: "var(--muted)" }}>Approved by</div><div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{d.org.approved_by ?? "—"}</div></div>
              </div>
            </div>
          </div>
        )}

        {tab === "Members" && (
          <div style={{ padding: 0 }}>
            <div style={{ padding: 16, borderBottom: "1px solid var(--line)" }}>
              <input type="text" className="input" placeholder="Search members…" style={{ maxWidth: 280 }} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Role</th><th>Verification</th><th>Joined</th></tr></thead>
                <tbody>
                  {members.map((m, i) => <tr key={i}><td style={{ fontWeight: 600, color: "var(--ink)" }}>{m.name}</td><td>{m.role}</td><td><span className={`badge ${m.level === 2 ? "badge-success" : m.level === 1 ? "badge-info" : "badge-muted"}`}>{LVL[m.level]}</span></td><td style={{ fontSize: 12, color: "var(--muted)" }}>{m.joinedAt?.slice(0, 10)}</td></tr>)}
                  {members.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>{d.members.length === 0 ? "No members yet." : "No members match."}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "Children" && (
          <div style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Guardian</th><th>Relationship</th><th>Classroom</th><th>Allergies</th><th>Medical notes</th></tr></thead>
                <tbody>
                  {(d.children ?? []).map((c, i) => <tr key={i}><td style={{ fontWeight: 600, color: "var(--ink)" }}>{c.name}</td><td>{c.guardian}</td><td>{c.relationship ?? "—"}</td><td>{c.classroom || "—"}</td><td>{c.allergies || "—"}</td><td>{c.medicalNotes || "—"}</td></tr>)}
                  {(d.children ?? []).length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No children registered.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "Branches" && (
          <div style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>City</th></tr></thead>
                <tbody>
                  {d.workspaces.map((w) => <tr key={w.id}><td style={{ fontWeight: 600, color: "var(--ink)" }}>{w.name}</td><td>{w.city ?? "—"}</td></tr>)}
                  {d.workspaces.length === 0 && <tr><td colSpan={2} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No branches.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "Pastoral" && (
          <div style={{ padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
              <div className="card" style={{ padding: 14 }}><div style={{ fontSize: 11, color: "var(--muted)" }}>Requests</div><div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>{d.pastoralRequests?.total ?? 0}</div></div>
              <div className="card" style={{ padding: 14 }}><div style={{ fontSize: 11, color: "var(--muted)" }}>Open</div><div style={{ fontSize: 20, fontWeight: 700, color: "var(--warning)" }}>{d.pastoralRequests?.open ?? 0}</div></div>
              <div className="card" style={{ padding: 14 }}><div style={{ fontSize: 11, color: "var(--muted)" }}>Scheduled</div><div style={{ fontSize: 20, fontWeight: 700, color: "var(--info)" }}>{d.pastoralRequests?.scheduled ?? 0}</div></div>
              <div className="card" style={{ padding: 14 }}><div style={{ fontSize: 11, color: "var(--muted)" }}>Resolved</div><div style={{ fontSize: 20, fontWeight: 700, color: "var(--success)" }}>{d.pastoralRequests?.resolved ?? 0}</div></div>
            </div>
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table>
                <thead><tr><th>From</th><th>Category</th><th>Details</th><th>Status</th><th>When</th></tr></thead>
                <tbody>
                  {(d.pastoralCareRows ?? []).map((r) => <tr key={r.id}><td style={{ fontWeight: 500, color: "var(--ink)" }}>{r.requesterName || "—"}</td><td>{r.category}</td><td>{r.details || "—"}</td><td><span className={`badge ${r.status === "resolved" ? "badge-success" : r.status === "open" ? "badge-warning" : "badge-muted"}`}>{r.status}</span></td><td style={{ fontSize: 12, color: "var(--muted)" }}>{r.createdAt?.slice(0, 10)}</td></tr>)}
                  {(d.pastoralCareRows ?? []).length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No care requests.</td></tr>}
                </tbody>
              </table>
            </div>
            <h4 style={{ marginBottom: 8 }}>Form submissions</h4>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Form</th><th>Status</th><th>When</th></tr></thead>
                <tbody>
                  {(d.formSubmissions ?? []).map((f) => <tr key={f.id}><td>{f.formType.replace(/_/g, " ")}</td><td><span className={`badge ${f.status === "completed" ? "badge-success" : "badge-warning"}`}>{f.status}</span></td><td style={{ fontSize: 12, color: "var(--muted)" }}>{f.createdAt?.slice(0, 10)}</td></tr>)}
                  {(d.formSubmissions ?? []).length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No form submissions.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "KYC" && (
          <div style={{ padding: 20 }}>
            {d.kyc ? (
              <div className="flex items-center gap-4" style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span className={`badge ${statusBadge(d.kyc.status)}`}>{d.kyc.status}</span>
                <Link className="btn btn-primary" href={`/admin/kyc/${d.kyc.id}`}>Review KYC Application</Link>
              </div>
            ) : (
              <p style={{ color: "var(--muted)" }}>No KYC application found for this church.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
