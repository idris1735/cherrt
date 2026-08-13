"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../use-admin-fetch";
import { InfoTip, TIPS } from "@/components/admin/info-tip";

type Person = {
  id: string;
  name: string;
  phones: { phone: string; verified: boolean }[];
  verified: boolean;
  churches: { workspaceId: string; churchName: string; role: string }[];
};

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [hasRole, setHasRole] = useState("");

  useEffect(() => {
    adminFetch<{ people: Person[] }>("/api/admin/people").then((r) => {
      if (r.status === 401) setErr(true);
      else setPeople(r.data?.people ?? []);
    });
  }, []);

  const visible = useMemo(() => {
    if (!people) return [];
    let v = people;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      v = v.filter((p) => p.name.toLowerCase().includes(t) || p.phones.some((ph) => ph.phone.includes(t)));
    }
    if (level === "verified") v = v.filter((p) => p.verified);
    if (level === "unverified") v = v.filter((p) => !p.verified);
    if (hasRole === "yes") v = v.filter((p) => p.churches.length > 0);
    if (hasRole === "no") v = v.filter((p) => p.churches.length === 0);
    return [...v].sort((a, b) => a.name.localeCompare(b.name));
  }, [people, q, level, hasRole]);

  if (err) return <div className="page"><div className="error-box">🔒 Not authorized.</div></div>;
  if (!people) return <div className="page"><div className="skeleton" style={{ height: 200, marginBottom: 16 }} /><div className="skeleton" style={{ height: 16, width: "40%" }} /></div>;

  return (
    <div className="page animate-in">
      <div className="page-header">
        <div>
          <div className="breadcrumbs"><span>Platform</span><span className="sep">/</span><span>People</span></div>
          <h1>People Directory</h1>
        </div>
        <div className="flex items-center gap-2">
          <input type="text" className="input" placeholder="Search name or phone…" style={{ width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
          <select className="input select" style={{ width: 140 }} value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filter by verification">
            <option value="">All levels</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>
          <select className="input select" style={{ width: 150 }} value={hasRole} onChange={(e) => setHasRole(e.target.value)} aria-label="Filter by membership">
            <option value="">Members & guests</option>
            <option value="yes">Members only</option>
            <option value="no">Guests only</option>
          </select>
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Verification</th><th>Churches</th><th>Roles</th></tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/people/${p.id}`} style={{ fontWeight: 600, color: "var(--ink)" }}>{p.name}</Link>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{p.phones.map((ph) => ph.phone).join(", ") || "—"}</td>
                  <td><span className={`badge ${p.verified ? "badge-success" : "badge-muted"}`}>{p.verified ? "L1+" : "L0"} <InfoTip text={p.verified ? TIPS.l1 : TIPS.l0} /></span></td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{p.churches.map((c) => c.churchName).join(", ") || "—"}</td>
                  <td>
                    {p.churches.map((c) => <span key={c.workspaceId} className="badge badge-muted" style={{ marginRight: 4 }}>{c.role}</span>)}
                    {p.churches.length === 0 && <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>
                  {people.length === 0 ? "No people yet. They'll appear once someone messages Chertt on WhatsApp." : "No people match your search."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
