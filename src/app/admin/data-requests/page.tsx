"use client";
import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../use-admin-fetch";
import { toast } from "@/components/admin/toast";

type Request = { id: string; kind: string; status: string; note: string; personName: string; createdAt: string };

function kindBadge(kind: string) {
  if (kind === "deletion") return "badge-danger";
  if (kind === "access") return "badge-info";
  return "badge-warning"; // objection
}

export default function DataRequestsPage() {
  const [rows, setRows] = useState<Request[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = (all: boolean) => {
    adminFetch<{ requests: Request[] }>(`/api/admin/data-requests${all ? "?all=1" : ""}`).then((r) => {
      if (r.status === 401) setErr(true);
      else setRows(r.data?.requests ?? []);
    });
  };
  useEffect(() => { load(showAll); }, [showAll]);

  const visible = useMemo(() => {
    if (!rows) return [];
    let v = rows;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      v = v.filter((r) => r.personName.toLowerCase().includes(t) || r.note.toLowerCase().includes(t));
    }
    if (status) v = v.filter((r) => r.status === status);
    return v;
  }, [rows, q, status]);

  if (err) return <div className="page"><div className="error-box">🔒 Not authorized.</div></div>;
  if (!rows) return <div className="page"><div className="skeleton" style={{ height: 200 }} /></div>;

  return (
    <div className="page animate-in">
      <div className="page-header">
        <div>
          <div className="breadcrumbs"><span>Platform</span><span className="sep">/</span><span>Data Requests</span></div>
          <h1>Data Requests</h1>
        </div>
        <div className="flex items-center gap-2">
          <input type="text" className="input" placeholder="Search requests…" style={{ width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search requests" />
          <select className="input select" style={{ width: 140 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="done">Done</option>
          </select>
          <button className={`btn btn-sm ${showAll ? "btn-primary" : "btn-ghost"}`} onClick={() => setShowAll((v) => !v)}>{showAll ? "All requests" : "Open only"}</button>
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Person</th><th>Type</th><th>Note</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, color: "var(--ink)" }}>{r.personName}</td>
                  <td><span className={`badge ${kindBadge(r.kind)}`} style={{ textTransform: "capitalize" }}>{r.kind}</span></td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{r.note || "—"}</td>
                  <td><span className={`badge ${r.status === "done" ? "badge-success" : "badge-warning"}`}>{r.status}</span></td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{r.createdAt?.slice(0, 10)}</td>
                  <td>
                    {r.status === "open" ? (
                      <button className="btn btn-sm btn-primary" onClick={async () => {
                        const res = await adminFetch<{ ok: boolean }>(`/api/admin/data-requests/${r.id}`, { method: "POST" });
                        if (res.data?.ok) {
                          toast(`Marked ${r.kind} request done`);
                          load(showAll);
                        } else toast("Failed to update request", "error");
                      }}>Mark Done</button>
                    ) : <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>No requests{rows.length === 0 ? " yet — they arrive when someone messages privacy/stop on WhatsApp." : " match your search."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}