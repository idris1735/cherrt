import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";
import { listFlaggedMessages, markFlagReviewed } from "@/lib/services/safety/flags";

export const dynamic = "force-dynamic";
const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;

export async function GET(req: Request): Promise<Response> {
  const admin = await platformAdminEmail(bearer(req));
  if (!admin) return Response.json({ error: "Not authorized." }, { status: 401 });
  return Response.json({ flags: await listFlaggedMessages() });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const admin = await platformAdminEmail(bearer(req));
  if (!admin) return Response.json({ error: "Not authorized." }, { status: 401 });
  const { id } = await params;
  const ok = await markFlagReviewed(id, admin);
  return Response.json(ok ? { ok: true } : { ok: false, error: "Not found or already reviewed." });
}