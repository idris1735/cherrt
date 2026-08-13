import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";
import { platformOverview, listDataRequests } from "@/lib/services/admin/foundation";

export const dynamic = "force-dynamic";
const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;

export async function GET(req: Request): Promise<Response> {
  if (!(await platformAdminEmail(bearer(req)))) return Response.json({ error: "Not authorized." }, { status: 401 });
  const [overview, dataRequests] = await Promise.all([platformOverview(), listDataRequests()]);
  return Response.json({ overview, dataRequests });
}
