"use client";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    adminFetch<{ people: Person[] }>("/api/admin/people").then((r) => {
      if (r.status === 401) setErr(true);
      else setPeople(r.data?.people ?? []);
    });
  }, []);

  if (err) return <div className={s.errorBox}>🔒 Not authorized.</div>;
  if (!people) return <><div className={s.skeleton} style={{ height: 200, marginBottom: 16 }} /><div className={s.skeleton} style={{ height: 16, width: "40%" }} /></>;

  return (
    <>
      <h1 className={s.pageTitle}>People</h1>
      <p className={s.pageSub}>{people.length} across all churches.</p>
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
              {people.map((p) => (
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
              {people.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>
                    No people yet. They&apos;ll appear once someone messages Chertt on WhatsApp.
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
