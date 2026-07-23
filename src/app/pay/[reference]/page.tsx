import { getSupabaseServerClient } from "@/lib/services/supabase-server";

export const dynamic = "force-dynamic";

type DemoPayment = {
  reference: string;
  amount: number;
  giving_type: string;
  donor_name: string;
  status: string;
  workspaces?: { name?: string } | { name?: string }[] | null;
};

function naira(n: number): string {
  return "₦" + Number(n || 0).toLocaleString("en-NG");
}

const wrap = { minHeight: "100vh", margin: 0, background: "#0f1216", color: "#e9edf2", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" } as const;
const card = { width: "100%", maxWidth: 420, background: "#171b21", border: "1px solid #262c35", borderRadius: 18, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.45)" } as const;
const header = { padding: "22px 24px", borderBottom: "1px solid #232935", display: "flex", alignItems: "center", justifyContent: "space-between" } as const;
const body = { padding: "24px" } as const;
const amountBox = { textAlign: "center" as const, padding: "18px 0 22px" };
const btn = { display: "block", width: "100%", padding: "15px", border: "none", borderRadius: 12, background: "#2ea36a", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" } as const;
const row = { display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #21262f", fontSize: 14 } as const;

export default async function PayPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { reference } = await params;
  const { paid } = await searchParams;
  const db = getSupabaseServerClient();
  const { data } = db
    ? await db.from("demo_payments").select("reference, amount, giving_type, donor_name, status, workspaces(name)").eq("reference", reference).maybeSingle()
    : { data: null };
  const dp = data as DemoPayment | null;

  if (!dp) {
    return (
      <div style={wrap}><div style={card}><div style={body}><h2 style={{ margin: 0 }}>Payment not found</h2><p style={{ color: "#9aa4b1" }}>This giving link is invalid or has expired.</p></div></div></div>
    );
  }
  const churchName = (Array.isArray(dp.workspaces) ? dp.workspaces[0]?.name : dp.workspaces?.name) || "your church";
  const done = paid === "1" || dp.status === "paid";

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={header}>
          <div style={{ fontWeight: 800, letterSpacing: "-.02em" }}>⛪ {churchName}</div>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#f0a24e", background: "#3a2a12", padding: "4px 9px", borderRadius: 999 }}>Demo</span>
        </div>
        <div style={body}>
          {done ? (
            <div style={{ textAlign: "center", padding: "18px 0" }}>
              <div style={{ fontSize: 46 }}>✅</div>
              <h2 style={{ margin: "10px 0 4px" }}>Giving received</h2>
              <p style={{ color: "#9aa4b1", margin: 0 }}>{naira(dp.amount)} {dp.giving_type} — thank you{dp.donor_name ? `, ${dp.donor_name}` : ""}! 🙏</p>
              <p style={{ color: "#6b7482", fontSize: 13, marginTop: 16 }}>You'll get a confirmation on WhatsApp. You can close this page.</p>
            </div>
          ) : (
            <>
              <div style={amountBox}>
                <div style={{ color: "#8b93a1", fontSize: 13, marginBottom: 6 }}>{dp.giving_type.charAt(0).toUpperCase() + dp.giving_type.slice(1)} to {churchName}</div>
                <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-.03em" }}>{naira(dp.amount)}</div>
              </div>
              <div style={row}><span style={{ color: "#8b93a1" }}>Giving type</span><span style={{ fontWeight: 600 }}>{dp.giving_type}</span></div>
              <div style={{ ...row, borderBottom: "none" }}><span style={{ color: "#8b93a1" }}>From</span><span style={{ fontWeight: 600 }}>{dp.donor_name || "Anonymous"}</span></div>
              <form action="/api/pay/complete" method="POST" style={{ marginTop: 18 }}>
                <input type="hidden" name="reference" value={dp.reference} />
                <button type="submit" style={btn}>Pay {naira(dp.amount)} securely</button>
              </form>
              <p style={{ color: "#6b7482", fontSize: 12, textAlign: "center", marginTop: 14 }}>Demo checkout — no real card is charged. With Paystack enabled, this is where card/bank/transfer happens.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
