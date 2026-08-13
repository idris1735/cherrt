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
  guardians?: { guardianName: string; relationship: string; isPrimary: boolean }[];
  milestones: { type: string; occurredOn: string | null; details: Record<string, unknown> }[];
  pastoralRequests: { id: string; category: string; status: string; createdAt: string }[];
  prayerRequests?: { id: string; request: string; isAnonymous: boolean; status: string; createdAt: string }[];
  dataRequests?: { id: string; kind: string; status: string; note: string; createdAt: string }[];
  givingRecords?: { id: string; amount: number; givingType: string; service: string; createdAt: string }[];
  givingTotal?: number;
};

const LVL = ["Unverified", "WhatsApp-verified", "KYC-verified"];
const TABS = ["Timeline", "Memberships", "Family", "Requests", "Giving"] as const;
type Tab = (typeof TABS)[number];

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
  if (st === "resolved" || st === "answered" || st === "done") return s.badgeGreen;
  if (st === "open" || st === "praying") return s.badgeAmber;
  return s.badgeNeutral;
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

  if (msg) return <div className={s.errorBox}>{msg}</div>;
  if (!p) return <><div className={s.skeleton} style={{ height: 160, marginBottom: 16 }} /><div className={s.skeleton} style={{ height: 16, width: "40%" }} /></>;

  const level = p.memberships[0]?.verificationLevel ?? 0;

  return (
    <>
      <div className={s.crumbs}>
        <Link className={s.crumbLink} href="/admin/people">People</Link><span>/</span><span>{p.person.full_name || "Unknown"}</span>
      </div>
      <h1 className={s.pageTitle} style={{ margin: 0 }}>
        {p.person.full_name || "Unknown"}{" "}
        <span className={`${s.badge} ${level === 0 ? s.badgeNeutral : s.badgeGreen}`}>{LVL[level]}</span>
      </h1>
      <p className={s.pageSub}>
        {p.memberships.map((m) => m.church).join(" · ") || "Not a member anywhere"}
        {p.person.consent_source ? ` · consent: ${String(p.person.consent_source).replace(/_/g, " ")}${p.person.consent_version ? ` (${p.person.consent_version})` : ""}` : ""}
      </p>

      <div className={s.tabs} role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`${s.tab} ${tab === t ? s.tabActive : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Timeline" && (
        <div className={s.card}><div className={s.cardBody}>
          {p.milestones.length === 0 ? (
            <div className={s.emptyState}>
              <div className={s.emptyStateTitle}>No milestones yet</div>
              <div className={s.emptyStateBody}>Milestones appear here when they convert, dedicate a child, or record life events.</div>
            </div>
          ) : (
            <div className={s.timeline}>
              {p.milestones.map((m, i) => (
                <div className={s.timelineItem} key={i}>
                  <span className={s.timelineDot} />
                  <div className={s.timelineTitle}>{MILESTONE_ICON[m.type] ?? "📌"} {MILESTONE_LABEL[m.type] ?? m.type}</div>
                  <div className={s.timelineDate}>
                    {m.occurredOn ?? ""}
                    {m.details?.notes ? ` · ${String(m.details.notes)}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div></div>
      )}

      {tab === "Memberships" && (
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Church</th><th>Role</th><th>Verification</th><th>Joined</th></tr></thead>
          <tbody>
            {p.memberships.map((m, i) => <tr key={i}><td style={{ fontWeight: 500 }}>{m.church}</td><td><span className={`${s.badge} ${s.badgeNeutral}`}>{m.role}</span></td><td>{LVL[m.verificationLevel]}</td><td>{m.joinedAt?.slice(0, 10)}</td></tr>)}
            {p.memberships.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>Not a member anywhere.</td></tr>}
          </tbody>
        </table></div></div>
      )}

      {tab === "Family" && (
        <>
          <div className={s.chartGrid}>
            <div>
              <div className={s.sectionTitle}>Guardian of</div>
              <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
                <thead><tr><th>Child</th><th>Relationship</th><th>Primary</th></tr></thead>
                <tbody>
                  {p.guardianOf.map((g, i) => <tr key={i}><td style={{ fontWeight: 500 }}>{g.childName}</td><td>{g.relationship}</td><td>{g.isPrimary ? "✓" : ""}</td></tr>)}
                  {p.guardianOf.length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No children registered.</td></tr>}
                </tbody>
              </table></div></div>
            </div>
            <div>
              <div className={s.sectionTitle}>Guardians</div>
              <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
                <thead><tr><th>Guardian</th><th>Relationship</th><th>Primary</th></tr></thead>
                <tbody>
                  {(p.guardians ?? []).map((g, i) => <tr key={i}><td style={{ fontWeight: 500 }}>{g.guardianName}</td><td>{g.relationship}</td><td>{g.isPrimary ? "✓" : ""}</td></tr>)}
                  {(p.guardians ?? []).length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No guardians on file.</td></tr>}
                </tbody>
              </table></div></div>
            </div>
          </div>
        </>
      )}

      {tab === "Requests" && (
        <>
          <div className={s.section}><div className={s.sectionTitle}>Pastoral requests</div>
            <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
              <thead><tr><th>Category</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {p.pastoralRequests.map((r) => <tr key={r.id}><td>{r.category}</td><td><span className={`${s.badge} ${reqBadge(r.status)}`}>{r.status}</span></td><td>{r.createdAt?.slice(0, 10)}</td></tr>)}
                {p.pastoralRequests.length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No pastoral requests.</td></tr>}
              </tbody>
            </table></div></div>
          </div>
          <div className={s.section}><div className={s.sectionTitle}>Prayer requests</div>
            <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
              <thead><tr><th>Request</th><th>Anonymous</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {(p.prayerRequests ?? []).map((r) => <tr key={r.id}><td>{r.request}</td><td>{r.isAnonymous ? "Yes" : "No"}</td><td><span className={`${s.badge} ${reqBadge(r.status)}`}>{r.status}</span></td><td>{r.createdAt?.slice(0, 10)}</td></tr>)}
                {(p.prayerRequests ?? []).length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No prayer requests.</td></tr>}
              </tbody>
            </table></div></div>
          </div>
          <div className={s.section}><div className={s.sectionTitle}>Privacy requests</div>
            <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
              <thead><tr><th>Kind</th><th>Status</th><th>Note</th><th>When</th></tr></thead>
              <tbody>
                {(p.dataRequests ?? []).map((r) => <tr key={r.id}><td><span className={`${s.badge} ${r.kind === "deletion" ? s.badgeRed : s.badgeGreen}`}>{r.kind}</span></td><td><span className={`${s.badge} ${r.status === "done" ? s.badgeGreen : s.badgeAmber}`}>{r.status}</span></td><td>{r.note || "—"}</td><td>{r.createdAt?.slice(0, 10)}</td></tr>)}
                {(p.dataRequests ?? []).length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No privacy requests.</td></tr>}
              </tbody>
            </table></div></div>
          </div>
        </>
      )}

      {tab === "Giving" && (
        <>
          <div className={s.kpiGrid}>
            <div className={s.kpiCard} style={{ cursor: "default" }}><div className={s.kpiLabel}>Total given</div><div className={s.kpiValue}>₦{(p.givingTotal ?? 0).toLocaleString("en-NG")}</div></div>
            <div className={s.kpiCard} style={{ cursor: "default" }}><div className={s.kpiLabel}>Records</div><div className={s.kpiValue}>{(p.givingRecords ?? []).length}</div></div>
          </div>
          <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
            <thead><tr><th>Amount</th><th>Type</th><th>Service</th><th>When</th></tr></thead>
            <tbody>
              {(p.givingRecords ?? []).map((g) => <tr key={g.id}><td>₦{g.amount.toLocaleString("en-NG")}</td><td><span className={`${s.badge} ${s.badgeNeutral}`}>{g.givingType}</span></td><td>{g.service || "—"}</td><td>{g.createdAt?.slice(0, 10)}</td></tr>)}
              {(p.givingRecords ?? []).length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No giving records.</td></tr>}
            </tbody>
          </table></div></div>
        </>
      )}
    </>
  );
}
