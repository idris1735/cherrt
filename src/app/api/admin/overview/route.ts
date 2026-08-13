import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";
import {
  platformOverview,
  listDataRequests,
  platformTrends,
  kycFunnel,
  verificationBreakdown,
  activityFeed,
  type TrendPeriod,
} from "@/lib/services/admin/foundation";

export const dynamic = "force-dynamic";
const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;
const period = (req: Request): TrendPeriod => {
  const p = new URL(req.url).searchParams.get("period");
  return p === "7d" || p === "30d" || p === "90d" || p === "all" ? p : "30d";
};

export async function GET(req: Request): Promise<Response> {
  if (!(await platformAdminEmail(bearer(req)))) return Response.json({ error: "Not authorized." }, { status: 401 });
  const p = period(req);
  const [overview, dataRequests, trends, funnel, verification, feed] = await Promise.all([
    platformOverview(p),
    listDataRequests(),
    platformTrends(p),
    kycFunnel(),
    verificationBreakdown(),
    activityFeed(12),
  ]);
  return Response.json({ overview, dataRequests, trends, funnel, verification, feed });
}
