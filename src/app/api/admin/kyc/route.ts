import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";
import { listAllApplications } from "@/lib/services/kyc/review";

export const dynamic = "force-dynamic";

function bearer(req: Request): string | null {
  return req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;
}

export async function GET(req: Request): Promise<Response> {
  const admin = await platformAdminEmail(bearer(req));
  if (!admin) return Response.json({ error: "Not authorized." }, { status: 401 });
  return Response.json({ applications: await listAllApplications() });
}
