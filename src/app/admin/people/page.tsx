"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import s from "@/components/admin/admin-kit.module.css";
import { adminFetch } from "../use-admin-fetch";

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

  if (err) return <div className={s.errorBox}>🔒 Not authorized.</div>;
  if (!people) return <><div className={s.skeleton} style={{ height: 200, marginBottom: 16 }} /><div className={s.skeleton} style={{ height: 16, width: "40%" }} /></>;

  return (
    <>
      <h1 className={s.pageTitle}>People</h1>
      <p className={s.pageSub}>{people.length} across all churches.</p>
      <div className={s.toolbar}>
        <input className={`${s.input} ${s.toolbarSearch}`} aria-label="Search people" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={s.select} aria-label="Filter by verification" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">All levels</option>
          <option value="verified">Verified</option>
          <option value="unverified">Unverified</option>
        </select>
        <select className={s.select} aria-label="Filter by membership" value={hasRole} onChange={(e) => setHasRole(e.target.value)}>
          <option value="">Members & guests</option>
          <option value="yes">Members only</option>
          <option value="no">Guests only</option>
        </select>
        <span className={s.toolbarSpacer} />
        <span className={s.feedTime}>{visible.length} shown</span>
      </div>
      <div className={s.card}>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Verified</th>
                <th>Churches</th>
                <th>Roles</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>
                    <Link href={`/admin/people/${p.id}`} style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 500 }}>
                      {p.name}
                    </Link>
                  </td>
                  <td>{p.phones.map((ph) => ph.phone).join(", ") || "—"}</td>
                  <td>
                    <span className={`${s.badge} ${p.verified ? s.badgeGreen : s.badgeNeutral}`}>
                      {p.verified ? "L1+" : "L0"}
                    </span>
                  </td>
                  <td>{p.churches.map((c) => c.churchName).join(", ") || "—"}</td>
                  <td>
                    {p.churches.map((c) => (
                      <span key={c.workspaceId} className={`${s.badge} ${s.badgeNeutral}`} style={{ marginRight: 4 }}>
                        {c.role}
                      </span>
                    ))}
                    {p.churches.length === 0 && "—"}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>
                    {people.length === 0 ? "No people yet. They'll appear once someone messages Chertt on WhatsApp." : "No people match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
