"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { adminFetch } from "../../use-admin-fetch";
import { InfoTip, TIPS } from "@/components/admin/info-tip";

/* eslint-disable @typescript-eslint/no-explicit-any */
type PersonDetail = {
  person: any;
  memberships: { church: string; role: string; verificationLevel: number; joinedAt: string }[];
  guardianOf: { childName: string; relationship: string; isPrimary: boolean }[];
  guardians?: { guardianName: string; relationship: string; isPrimary: boolean }[];
  milestones: { type: string; occurredOn: string | null; details: Record<string, unknown> }[];
  pastoralRequests: { id: string; category: string; status: string; createdAt: string }[];
  prayerRequests?: { id: string; request: string; isAnonymous: boolean; status: string; createdAt: string }[];
  dataRequests?: { id: string; kind: string; status: string; note: string; createdAt: string }[];
  givingRecords?: { id: string; amount: number; givingType: string; service: string; createdAt: string }[];
  givingTotal?: number;
  phones?: { phone: string; verified: boolean; optedOut: boolean }[];
  consent?: { source: string | null; version: string | null; at: string | null; optedOut: boolean };
};

const LVL = ["Unverified", "WhatsApp-verified", "KYC-verified"];
const TABS = ["Timeline", "Memberships", "Family", "Requests", "Giving"] as const;
type Tab = (typeof TABS)[number];

const nf = (n: number) => n.toLocaleString("en-NG");

const MILESTONE_ICON: Record<string, string> = {
  salvation: "💒",
  baptism: "💧",
  child_dedication: "👶",
  marriage: "💍",
  joined_membership: "🤝",
  bereavement: "🕊️",
  other: "📌",
};
const MILESTONE_LABEL: Record<string, string> = {
  salvation: "Salvation",
  baptism: "Baptism",
  child_dedication: "Child Dedication",
  marriage: "Marriage",
  joined_membership: "Joined Membership",
  bereavement: "Bereavement",
  other: "Milestone",
};

function reqBadge(st: string) {
  if (st === "resolved" || st === "answered" || st === "done") return "badge-success";
  if (st === "open" || st === "praying") return "badge-warning";
  return "badge-muted";
}

export default function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [p, setP] = useState<PersonDetail | null>(null);
  const [tab, setTab] = useState<Tab>("Timeline");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    adminFetch<{ person: PersonDetail }>(`/api/admin/people/${id}`).then((r) => {
      if (!r.data) setMsg("Not authorized or not found.");
      else setP(r.data.person);
    });
  }, [id]);

  if (msg) return <div className="page"><div className="error-box">{msg}</div></div>;
  if (!p) return <div className="page"><div className="skeleton" style={{ height: 160, marginBottom: 16 }} /><div className="skeleton" style={{ height: 16, width: "40%" }} /></div>;

  const person = p.person;
  const initials = String(person.full_name ?? "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
  const level = p.memberships[0]?.verificationLevel ?? 0;
  const consent = p.consent ?? { source: null, version: null, at: null, optedOut: false };
  const phones = p.phones ?? [];

  return (
    <div className="page animate-in">
      <div className="page-header">
        <div>
          <div className="breadcrumbs">
            <span>Platform</span><span className="sep">/</span>
            <Link href="/admin/people">People</Link><span className="sep">/</span><span>{person.full_name || "Unknown"}</span>
          </div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {person.full_name || "Unknown"}{" "}
            <span className={`badge ${level === 0 ? "badge-muted" : "badge-success"}`}>{LVL[level]} <InfoTip text={level === 0 ? TIPS.l0 : level === 1 ? TIPS.l1 : TIPS.l2} /></span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link className="btn btn-sm" href="/admin/people">Back</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 16 }} className="charts-grid-2">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="tabs">
              {TABS.map((t) => <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
            </div>

            {tab === "Timeline" && (
              <div style={{ padding: 20 }}>
                {p.milestones.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-title">No milestones yet</div>
                    <div className="empty-state-body">Milestones appear here when they convert, dedicate a child, or record life events.</div>
                  </div>
                ) : (
                  <div className="timeline">
                    {p.milestones.map((m, i) => (
                      <div className="timeline-item" key={i}>
                        <div className={`timeline-dot ${i === p.milestones.length - 1 ? "active" : ""}`}>{MILESTONE_ICON[m.type] ?? "📌"}</div>
                        <div className="timeline-content">
                          <h4>{MILESTONE_LABEL[m.type] ?? m.type}</h4>
                          {m.details?.notes ? <p>{String(m.details.notes)}</p> : null}
                          <div className="timeline-date">{m.occurredOn ?? ""}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "Memberships" && (
              <div style={{ padding: 20 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {p.memberships.map((m, i) => (
                    <div key={i} style={{ padding: 14, background: "var(--surface-muted)", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--ink)" }}>{m.church}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{m.role} · {LVL[m.verificationLevel]} · joined {m.joinedAt?.slice(0, 10)}</div>
                      </div>
                      <span className="badge badge-success">Active</span>
                    </div>
                  ))}
                  {p.memberships.length === 0 && <p style={{ color: "var(--muted)" }}>Not a member anywhere.</p>}
                </div>
              </div>
            )}

            {tab === "Family" && (
              <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <h4 style={{ marginBottom: 8 }}>Guardian of</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {p.guardianOf.map((g, i) => (
                      <div key={i} style={{ padding: 12, background: "var(--surface-muted)", borderRadius: "var(--radius-sm)" }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{g.childName}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{g.relationship}{g.isPrimary ? " · primary" : ""}</div>
                      </div>
                    ))}
                    {p.guardianOf.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>No children registered.</p>}
                  </div>
                </div>
                <div>
                  <h4 style={{ marginBottom: 8 }}>Guardians</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(p.guardians ?? []).map((g, i) => (
                      <div key={i} style={{ padding: 12, background: "var(--surface-muted)", borderRadius: "var(--radius-sm)" }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{g.guardianName}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{g.relationship}{g.isPrimary ? " · primary" : ""}</div>
                      </div>
                    ))}
                    {(p.guardians ?? []).length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>No guardians on file.</p>}
                  </div>
                </div>
              </div>
            )}

            {tab === "Requests" && (
              <div style={{ padding: 20 }}>
                <h4 style={{ marginBottom: 8 }}>Pastoral requests</h4>
                <div className="table-wrap" style={{ marginBottom: 16 }}>
                  <table>
                    <thead><tr><th>Category</th><th>Status</th><th>Created</th></tr></thead>
                    <tbody>
                      {p.pastoralRequests.map((r) => <tr key={r.id}><td>{r.category}</td><td><span className={`badge ${reqBadge(r.status)}`}>{r.status}</span></td><td style={{ fontSize: 12, color: "var(--muted)" }}>{r.createdAt?.slice(0, 10)}</td></tr>)}
                      {p.pastoralRequests.length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>No pastoral requests.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <h4 style={{ marginBottom: 8 }}>Prayer requests</h4>
                <div className="table-wrap" style={{ marginBottom: 16 }}>
                  <table>
                    <thead><tr><th>Request</th><th>Anonymous</th><th>Status</th><th>When</th></tr></thead>
                    <tbody>
                      {(p.prayerRequests ?? []).map((r) => <tr key={r.id}><td>{r.request}</td><td>{r.isAnonymous ? "Yes" : "No"}</td><td><span className={`badge ${reqBadge(r.status)}`}>{r.status}</span></td><td style={{ fontSize: 12, color: "var(--muted)" }}>{r.createdAt?.slice(0, 10)}</td></tr>)}
                      {(p.prayerRequests ?? []).length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>No prayer requests.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <h4 style={{ marginBottom: 8 }}>Privacy requests</h4>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Kind</th><th>Status</th><th>Note</th><th>When</th></tr></thead>
                    <tbody>
                      {(p.dataRequests ?? []).map((r) => <tr key={r.id}><td><span className={`badge ${r.kind === "deletion" ? "badge-danger" : "badge-info"}`}>{r.kind}</span></td><td><span className={`badge ${r.status === "done" ? "badge-success" : "badge-warning"}`}>{r.status}</span></td><td>{r.note || "—"}</td><td style={{ fontSize: 12, color: "var(--muted)" }}>{r.createdAt?.slice(0, 10)}</td></tr>)}
                      {(p.dataRequests ?? []).length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>No privacy requests.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === "Giving" && (
              <div style={{ padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                  <div style={{ flex: 1, padding: 16, background: "var(--surface-muted)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Total Giving</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }} className="tabular mt-1">₦{nf(p.givingTotal ?? 0)}</div>
                  </div>
                  <div style={{ flex: 1, padding: 16, background: "var(--surface-muted)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Records</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }} className="tabular mt-1">{(p.givingRecords ?? []).length}</div>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Service</th></tr></thead>
                    <tbody>
                      {(p.givingRecords ?? []).map((g) => <tr key={g.id}><td style={{ fontSize: 12, color: "var(--muted)" }}>{g.createdAt?.slice(0, 10)}</td><td>{g.givingType}</td><td className="tabular" style={{ fontWeight: 600, color: "var(--ink)" }}>₦{nf(g.amount)}</td><td style={{ fontSize: 12, color: "var(--muted)" }}>{g.service || "—"}</td></tr>)}
                      {(p.givingRecords ?? []).length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No giving records.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: 20, textAlign: "center" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, margin: "0 auto 12px" }}>{initials}</div>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink)" }}>{person.full_name}</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{p.memberships[0]?.role ?? "No role"}</div>
            <div className="mt-3" style={{ textAlign: "left" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}><strong style={{ color: "var(--ink)" }}>Phone:</strong> {phones.map((ph) => ph.phone).join(", ") || "—"}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}><strong style={{ color: "var(--ink)" }}>Email:</strong> {person.email ?? "—"}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}><strong style={{ color: "var(--ink)" }}>DOB:</strong> {person.birthdate ?? "—"}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}><strong style={{ color: "var(--ink)" }}>Gender:</strong> {person.gender ?? "—"}</div>
            </div>
          </div>

          {/* Real consent status — source/version/opt-out from the people + phone_contacts rows */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", marginBottom: 12 }}>Consent Status</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: consent.source ? "var(--success)" : "var(--muted-light)" }} />
              <span style={{ fontSize: 13 }}>Lawful basis: {consent.source ? String(consent.source).replace(/_/g, " ") : "none recorded"}</span>
            </div>
            {consent.version && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />
                <span style={{ fontSize: 13 }}>Consent version: {consent.version}</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: consent.optedOut ? "var(--danger)" : "var(--success)" }} />
              <span style={{ fontSize: 13 }}>WhatsApp: {consent.optedOut ? "Opted out (never messaged)" : "Active"}</span>
            </div>
            {consent.at && <div style={{ fontSize: 11, color: "var(--muted-light)", marginTop: 8 }}>Consented {consent.at.slice(0, 10)}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
