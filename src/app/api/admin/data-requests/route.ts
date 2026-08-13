import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";
import { listDataRequests } from "@/lib/services/admin/foundation";

export const dynamic = "force-dynamic";
const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;

export async function GET(req: Request): Promise<Response> {
  if (!(await platformAdminEmail(bearer(req)))) return Response.json({ error: "Not authorized." }, { status: 401 });
  // ?all=1 → include done rows; default: open only (the actionable queue)
  const all = new URL(req.url).searchParams.get("all") === "1";
  return Response.json({ requests: await listDataRequests(200, all) });
}