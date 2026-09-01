import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { isSubscriptionActive, PLACEHOLDER_PLAN, type Subscription, type SubscriptionStatus } from "@/lib/services/billing/subscription";

export const dynamic = "force-dynamic";

type OrgRow = {
  name: string;
  status: string;
  subscription_status: string | null;
  subscription_plan: string | null;
  subscription_expires_at: string | null;
};

const wrap = { minHeight: "100vh", margin: 0, background: "#0f1216", color: "#e9edf2", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" } as const;
const card = { width: "100%", maxWidth: 420, background: "#171b21", border: "1px solid #262c35", borderRadius: 18, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.45)" } as const;
const header = { padding: "22px 24px", borderBottom: "1px solid #232935", display: "flex", alignItems: "center", justifyContent: "space-between" } as const;
const body = { padding: "24px" } as const;
const btn = { display: "block", width: "100%", padding: "15px", border: "none", borderRadius: 12, background: "#2ea36a", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" } as const;
const row = { display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #21262f", fontSize: 14 } as const;
const badge = { fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "#f0a24e", background: "#3a2a12", padding: "4px 9px", borderRadius: 999 };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default async function BillingPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ activated?: string }> }) {
  const { org } = await params;
  const { activated } = await searchParams;
  const db = getSupabaseServerClient();
  const { data } = db
    ? await db.from("organizations").select("name, status, subscription_status, subscription_plan, subscription_expires_at").eq("id", org).maybeSingle()
    : { data: null };
  const o = data as OrgRow | null;

  if (!o) {
    return (
      <div style={wrap}><div style={card}><div style={body}><h2 style={{ margin: 0 }}>Church not found</h2><p style={{ color: "#9aa4b1" }}>This billing link is invalid or has expired.</p></div></div></div>
    );
  }

  const sub: Subscription = {
    status: (o.subscription_status as SubscriptionStatus) ?? "active",
    plan: o.subscription_plan ?? null,
    expiresAt: o.subscription_expires_at ?? null,
  };
  const active = activated === "1" || isSubscriptionActive(sub);

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={header}>
          <div style={{ fontWeight: 800, letterSpacing: "-.02em" }}>⛪ {o.name}</div>
          <span style={badge}>Demo</span>
        </div>
        <div style={body}>
          <div style={{ textAlign: "center", padding: "8px 0 18px" }}>
            <div style={{ color: "#8b93a1", fontSize: 13, marginBottom: 6 }}>Chertt subscription</div>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.03em" }}>{sub.plan || PLACEHOLDER_PLAN}</div>
          </div>
          <div style={row}><span style={{ color: "#8b93a1" }}>Status</span><span style={{ fontWeight: 700, color: active ? "#5fd39a" : "#e8a13c" }}>{active ? "Active" : (sub.status.charAt(0).toUpperCase() + sub.status.slice(1))}</span></div>
          <div style={{ ...row, borderBottom: "none" }}><span style={{ color: "#8b93a1" }}>{active ? "Renews" : "Expired"}</span><span style={{ fontWeight: 600 }}>{fmtDate(sub.expiresAt)}</span></div>

          {active ? (
            <div style={{ textAlign: "center", padding: "16px 0 4px" }}>
              <div style={{ fontSize: 40 }}>✅</div>
              <p style={{ color: "#9aa4b1", margin: "8px 0 0" }}>Subscription is active. Your members can connect. You can close this page.</p>
            </div>
          ) : (
            <form action="/api/billing/activate" method="POST" style={{ marginTop: 18 }}>
              <input type="hidden" name="org" value={org} />
              <button type="submit" style={btn}>Activate subscription</button>
            </form>
          )}
          <p style={{ color: "#6b7482", fontSize: 12, textAlign: "center", marginTop: 14 }}>Demo billing — no real card is charged. With payments enabled, this is where card/bank/transfer happens.</p>
        </div>
      </div>
    </div>
  );
}
