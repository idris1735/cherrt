"use client";
import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../use-admin-fetch";
import { toast } from "@/components/admin/toast";

type Flag = { id: string; kind: "scam" | "safeguarding"; reason: string; excerpt: string; fromPhone: string; personName: string; status: string; createdAt: string };

export default function FlaggedMessagesPage() {
  const [rows, setRows] = useState<Flag[] | null>(null);
  const [err, setErr] = useState(false);
  const [filter, setFilter] = useState("");

  const load = () => {
    adminFetch<{ flags: Flag[] }>("/api/admin/flagged").then((r) => {
      if (r.status === 401) setErr(true);
      else setRows(r.data?.flags ?? []);
    });
  };
  useEffect(load, []);

  const visible = useMemo(() => {
    if (!rows) return [];
    if (!filter) return rows;
    return rows.filter((f) => f.kind === filter);
  }, [rows, filter]);

  if (err) return <div className="page"><div className="error-box">🔒 Not authorized.</div></div>;
  if (!rows) return <div className="page"><div className="skeleton" style={{ height: 200 }} /></div>;

  return (
    <div className="page animate-in">
      <div className="page-header">
        <div>
          <div className="breadcrumbs"><span>Platform</span><span className="sep">/</span><span>Flagged Messages</span></div>
          <h1>Flagged Messages</h1>
        </div>
        <div className="flex items-center gap-2">
          <select className="input select" style={{ width: 170 }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by kind">
            <option value="">All kinds</option>
            <option value="scam">Scams</option>
            <option value="safeguarding">Safeguarding</option>
          </select>
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Kind</th><th>From</th><th>Person</th><th>Reason</th><th>Message</th><th>Status</th><th>When</th><th /></tr></thead>
            <tbody>
              {visible.map((f) => (
                <tr key={f.id}>
                  <td>
                    <span className={`badge ${f.kind === "safeguarding" ? "badge-danger" : "badge-warning"}`}>
                      {f.kind === "safeguarding" ? "🚨 SAFEGUARDING" : "Scam"}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{f.fromPhone || "—"}</td>
                  <td style={{ fontWeight: 600, color: "var(--ink)" }}>{f.personName}</td>
                  <td style={{ fontSize: 12 }}>{f.reason}</td>
                  <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 280 }} className="truncate">{f.excerpt}</td>
                  <td><span className={`badge ${f.status === "reviewed" ? "badge-success" : "badge-accent"}`}>{f.status}</span></td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{f.createdAt?.slice(0, 10)}</td>
                  <td>
                    {f.status === "open" ? (
                      <button className="btn btn-sm btn-primary" onClick={async () => {
                        const res = await adminFetch<{ ok: boolean }>(`/api/admin/flagged/${f.id}`, { method: "POST" });
                        if (res.data?.ok) { toast("Marked reviewed"); load(); } else toast("Update failed", "error");
                      }}>Reviewed</button>
                    ) : <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>
                  {rows.length === 0 ? "No flags yet — the assistant flags scams and safeguarding disclosures here as they happen." : "No flags match the filter."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}