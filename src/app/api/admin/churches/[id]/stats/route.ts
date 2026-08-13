import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";
import { churchStats, givingTrend, memberTrend, type TrendPeriod } from "@/lib/services/admin/foundation";

export const dynamic = "force-dynamic";
const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;
const period = (req: Request): TrendPeriod => {
  const p = new URL(req.url).searchParams.get("period");
  return p === "7d" || p === "30d" || p === "90d" || p === "all" ? p : "30d";
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!(await platformAdminEmail(bearer(req)))) return Response.json({ error: "Not authorized." }, { status: 401 });
  const { id } = await params;
  const stats = await churchStats(id);
  if (!stats) return Response.json({ error: "Not found." }, { status: 404 });
  const p = period(req);
  // Aggregated series only — never raw rows.
  const [giving, growth] = await Promise.all([givingTrend(p, id), memberTrend(p, id)]);
  return Response.json({ stats, giving, growth });
}
