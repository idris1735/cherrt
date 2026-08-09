"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";

type Row = { id: string; church_legal_name: string; applicant_phone: string; trustee_match: string | null; created_at: string };

export default function AdminKycList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      const supa = getSupabaseBrowserClient();
      const token = supa ? (await supa.auth.getSession()).data.session?.access_token : null;
      const res = await fetch("/api/admin/kyc", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.status === 401) { setDenied(true); return; }
      const j = await res.json();
      setRows(j.applications ?? []);
    })();
  }, []);

  if (denied) return <Shell><h2>Not authorized</h2><p style={sub}>Your account isn&apos;t on the Chertt review team.</p></Shell>;
  if (!rows) return <Shell><p style={sub}>Loading…</p></Shell>;

  return (
    <Shell>
      <h2>Church applications — pending review</h2>
      <p style={sub}>{rows.length} awaiting a decision.</p>
      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {rows.map((r) => (
          <Link key={r.id} href={`/admin/kyc/${r.id}`} style={card}>
            <div style={{ fontWeight: 700 }}>{r.church_legal_name || "Unnamed church"}</div>
            <div style={sub}>{r.applicant_phone} · trustee: {r.trustee_match ?? "—"}</div>
          </Link>
        ))}
        {rows.length === 0 && <p style={sub}>Nothing pending. 🎉</p>}
      </div>
    </Shell>
  );
}

const sub = { color: "#9baba0", fontSize: 14 } as const;
const card = { display: "block", padding: 14, borderRadius: 12, border: "1px solid #26332b", background: "#141d18", color: "#e8efe9", textDecoration: "none" } as const;
function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", background: "#0e1512", color: "#e8efe9", fontFamily: "system-ui", padding: 24, display: "flex", justifyContent: "center" }}><div style={{ width: "100%", maxWidth: 720 }}>{children}</div></div>;
}
