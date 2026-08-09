"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function authHeader(): Promise<Record<string, string>> {
  const supa = getSupabaseBrowserClient();
  const token = supa ? (await supa.auth.getSession()).data.session?.access_token : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AdminKycDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [app, setApp] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/kyc/${id}`, { headers: await authHeader() });
      if (!res.ok) { setMsg("Not authorized or not found."); return; }
      setApp((await res.json()).application);
    })();
  }, [id]);

  async function act(action: "approve" | "reject") {
    let reason = "";
    if (action === "reject") { reason = window.prompt("Reason for rejection (sent to the applicant):") ?? ""; if (!reason.trim()) return; }
    setBusy(true); setMsg("");
    const res = await fetch(`/api/admin/kyc/${id}`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ action, reason }) });
    const j = await res.json();
    setBusy(false);
    if (j.ok) { router.push("/admin/kyc"); } else { setMsg(j.error ?? j.reason ?? "Action failed."); }
  }

  if (msg && !app) return <Shell><p style={sub}>{msg}</p></Shell>;
  if (!app) return <Shell><p style={sub}>Loading…</p></Shell>;

  return (
    <Shell>
      <h2>{app.church_legal_name}</h2>
      <p style={sub}>IT/RC {app.it_number} · {app.address}</p>

      <Section title="Applicant">
        <Row k="Stated" v={app.applicant_role} />
        <Row k="Phone" v={app.applicant_phone} />
        <Row k="Email" v={`${app.email ?? "—"}${app.email_verified_at ? " ✓" : ""}`} />
        <Row k="Trustee match" v={app.trustee_match} />
      </Section>

      <Section title="Identity photos (compare)">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Photo label="Selfie holding ID" src={app.selfieUrl} />
          <Photo label="ID photo (Mono)" src={app.idPhotoDataUrl} />
        </div>
      </Section>

      <Section title="CAC lookup"><pre style={pre}>{JSON.stringify(app.cac_result, null, 2)}</pre></Section>
      <Section title="ID lookup"><pre style={pre}>{JSON.stringify(app.id_result, null, 2)}</pre></Section>

      {msg && <p style={{ color: "#ff6b6b" }}>{msg}</p>}
      {app.status === "pending" ? (
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button disabled={busy} onClick={() => act("approve")} style={btn}>Approve &amp; create church</button>
          <button disabled={busy} onClick={() => act("reject")} style={btnGhost}>Reject…</button>
        </div>
      ) : <p style={sub}>Already {app.status}.</p>}
    </Shell>
  );
}

const sub = { color: "#9baba0", fontSize: 14 } as const;
const pre = { background: "#0b120e", border: "1px solid #26332b", borderRadius: 10, padding: 12, overflowX: "auto" as const, fontSize: 12, color: "#c7d2cb" };
const btn = { padding: "12px 16px", border: "none", borderRadius: 12, background: "#0b3d2e", color: "#fff", fontWeight: 700, cursor: "pointer" } as const;
const btnGhost = { padding: "12px 16px", border: "1px solid #7a2e2e", borderRadius: 12, background: "transparent", color: "#ff9b9b", fontWeight: 700, cursor: "pointer" } as const;
function Row({ k, v }: { k: string; v: any }) { return <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 14, padding: "4px 0" }}><span style={sub}>{k}</span><span>{String(v ?? "—")}</span></div>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <div style={{ marginTop: 20 }}><h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#7fd4a8" }}>{title}</h3>{children}</div>; }
function Photo({ label, src }: { label: string; src: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <div style={{ flex: "1 1 200px" }}><div style={sub}>{label}</div>{src ? <img src={src} alt={label} style={{ width: "100%", borderRadius: 10, border: "1px solid #26332b" }} /> : <div style={{ ...sub, padding: 20 }}>No image</div>}</div>;
}
function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", background: "#0e1512", color: "#e8efe9", fontFamily: "system-ui", padding: 24, display: "flex", justifyContent: "center" }}><div style={{ width: "100%", maxWidth: 720 }}>{children}</div></div>;
}
