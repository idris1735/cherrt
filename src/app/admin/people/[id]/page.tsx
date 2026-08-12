"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import s from "@/components/admin/admin-kit.module.css";
import { adminFetch } from "../../use-admin-fetch";

/* eslint-disable @typescript-eslint/no-explicit-any */
type PersonDetail = {
  person: any;
  memberships: { church: string; role: string; verificationLevel: number; joinedAt: string }[];
  guardianOf: { childName: string; relationship: string; isPrimary: boolean }[];
  milestones: { type: string; occurredOn: string | null; details: Record<string, unknown> }[];
  pastoralRequests: { id: string; category: string; status: string; createdAt: string }[];
};

const LVL = ["Unverified", "WhatsApp-verified", "KYC-verified"];
const MILESTONE_LABEL: Record<string, string> = {
  salvation: "💒 Salvation",
  baptism: "💧 Baptism",
  child_dedication: "👶 Child Dedication",
  marriage: "💍 Marriage",
  joined_membership: "🤝 Joined Membership",
  bereavement: "🕊️ Bereavement",
  other: "📌 Milestone",
};

export default function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [p, setP] = useState<PersonDetail | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    adminFetch<{ person: PersonDetail }>(`/api/admin/people/${id}`).then((r) => {
      if (!r.data) setMsg("Not authorized or not found.");
      else setP(r.data.person);
    });
  }, [id]);

  if (msg) return <div className={s.errorBox}>{msg}</div>;
  if (!p) return <><div className={s.skeleton} style={{ height: 160, marginBottom: 16 }} /><div className={s.skeleton} style={{ height: 16, width: "40%" }} /></>;

  return (
    <>
      <Link href="/admin/people" style={{ color: "var(--muted)", textDecoration: "none", fontSize: 13 }}>← People</Link>
      <h1 className={s.pageTitle} style={{ marginTop: 8 }}>{p.person.full_name || "Unknown"}</h1>

      <div className={s.section}>
        <div className={s.sectionTitle}>Profile</div>
        <div className={s.card}><div className={s.cardBody}>
          <div className={s.kvGrid}>
            <span className={s.kvKey}>Gender</span><span>{p.person.gender ?? "—"}</span>
            <span className={s.kvKey}>Birthdate</span><span>{p.person.birthdate ?? "—"}</span>
            <span className={s.kvKey}>Email</span><span>{p.person.email ?? "—"}</span>
            <span className={s.kvKey}>Marital status</span><span>{p.person.marital_status ?? "—"}</span>
            <span className={s.kvKey}>Joined</span><span>{p.person.joined_at ?? "—"}</span>
          </div>
        </div></div>
      </div>

      <div className={s.section}>
        <div className={s.sectionTitle}>Memberships</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Church</th><th>Role</th><th>Verification</th><th>Joined</th></tr></thead>
          <tbody>
            {p.memberships.map((m, i) => <tr key={i}><td>{m.church}</td><td><span className={`${s.badge} ${s.badgeNeutral}`}>{m.role}</span></td><td>{LVL[m.verificationLevel]}</td><td>{m.joinedAt?.slice(0, 10)}</td></tr>)}
            {p.memberships.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>Not a member anywhere.</td></tr>}
          </tbody>
        </table></div></div>
      </div>

      <div className={s.section}>
        <div className={s.sectionTitle}>Life timeline</div>
        <div className={s.card}><div className={s.cardBody}>
          {p.milestones.length === 0 ? (
            <div className={s.emptyState}>
              <div className={s.emptyStateTitle}>No milestones yet</div>
              <div className={s.emptyStateBody}>Milestones appear here when they convert, dedicate a child, or record life events.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {p.milestones.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%", background: "var(--accent)",
                    flexShrink: 0, marginTop: 6,
                  }} />
                  <div>
                    <strong style={{ fontSize: 14 }}>{MILESTONE_LABEL[m.type] ?? m.type}</strong>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {m.occurredOn ?? ""}
                      {m.details?.notes ? ` · ${String(m.details.notes)}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div></div>
      </div>

      <div className={s.section}>
        <div className={s.sectionTitle}>Guardian of</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Child</th><th>Relationship</th><th>Primary</th></tr></thead>
          <tbody>
            {p.guardianOf.map((g, i) => <tr key={i}><td>{g.childName}</td><td>{g.relationship}</td><td>{g.isPrimary ? "✓" : ""}</td></tr>)}
            {p.guardianOf.length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No children registered.</td></tr>}
          </tbody>
        </table></div></div>
      </div>

      <div className={s.section}>
        <div className={s.sectionTitle}>Pastoral requests</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Category</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {p.pastoralRequests.map((r) => <tr key={r.id}><td>{r.category}</td><td><span className={`${s.badge} ${r.status === "resolved" ? s.badgeGreen : r.status === "open" ? s.badgeAmber : s.badgeNeutral}`}>{r.status}</span></td><td>{r.createdAt?.slice(0, 10)}</td></tr>)}
            {p.pastoralRequests.length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No pastoral requests.</td></tr>}
          </tbody>
        </table></div></div>
      </div>
    </>
  );
}
