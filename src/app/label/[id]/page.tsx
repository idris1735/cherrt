import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://cherrt.vercel.app").replace(/\/$/, "");
}

const wrap = { minHeight: "100vh", margin: 0, background: "#eef1f5", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "24px", gap: "16px" };
const card = { width: "100%", maxWidth: 380, background: "#fff", border: "2px solid #111", borderRadius: 14, padding: "22px 24px", color: "#111" } as const;

export default async function LabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getSupabaseServerClient();
  const { data } = db
    ? await db.from("child_checkins").select("child_name, allergies, guardian_name, pickup_code, classroom_id, status").eq("id", id).maybeSingle()
    : { data: null };
  const c = data as any;

  if (!c) {
    return <div style={wrap}><div style={card}><h2 style={{ margin: 0 }}>Label not found</h2><p style={{ color: "#666" }}>This check-in link is invalid or has expired.</p></div></div>;
  }

  let classroom = "";
  if (db && c.classroom_id) {
    const { data: room } = await db.from("classrooms").select("name").eq("id", c.classroom_id).maybeSingle();
    classroom = (room as any)?.name ?? "";
  }
  const qr = `${appUrl()}/qr/img?preset=pickup&code=${encodeURIComponent(c.pickup_code)}`;

  return (
    <div style={wrap}>
      {/* Nametag label */}
      <div style={card}>
        <div style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#555", fontWeight: 700 }}>Children's check-in</div>
        <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, margin: "6px 0 2px" }}>{c.child_name}</div>
        {classroom ? <div style={{ fontSize: 17, fontWeight: 600, color: "#2563eb" }}>{classroom}</div> : null}
        {c.allergies ? (
          <div style={{ marginTop: 10, padding: "8px 10px", background: "#fdecec", border: "1px solid #f3b4b4", borderRadius: 8, color: "#b42318", fontWeight: 700, fontSize: 14 }}>
            ⚠️ Allergies: {c.allergies}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14, borderTop: "1px dashed #bbb", paddingTop: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Pickup QR" width={92} height={92} style={{ display: "block" }} />
          <div>
            <div style={{ fontSize: 12, color: "#555" }}>Pickup code</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: ".06em" }}>{c.pickup_code}</div>
            {c.guardian_name ? <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>Guardian: {c.guardian_name}</div> : null}
          </div>
        </div>
      </div>

      <PrintButton />
      <style>{"@media print{.no-print{display:none!important}body{background:#fff!important}}"}</style>
    </div>
  );
}
