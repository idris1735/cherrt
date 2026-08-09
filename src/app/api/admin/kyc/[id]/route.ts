import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";
import { getApplicationForReview, approveKycApplication, rejectKycApplication } from "@/lib/services/kyc/review";

export const dynamic = "force-dynamic";

function bearer(req: Request): string | null {
  return req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const admin = await platformAdminEmail(bearer(req));
  if (!admin) return Response.json({ error: "Not authorized." }, { status: 401 });
  const { id } = await params;
  const detail = await getApplicationForReview(id);
  if (!detail) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ application: detail });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const admin = await platformAdminEmail(bearer(req));
  if (!admin) return Response.json({ error: "Not authorized." }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string };
  if (body.action === "approve") {
    const r = await approveKycApplication(id, admin);
    return Response.json(r, { status: r.ok ? 200 : 409 });
  }
  if (body.action === "reject") {
    if (!body.reason?.trim()) return Response.json({ ok: false, error: "A reason is required." }, { status: 400 });
    const r = await rejectKycApplication(id, admin, body.reason.trim());
    return Response.json(r, { status: r.ok ? 200 : 409 });
  }
  return Response.json({ error: "Unknown action." }, { status: 400 });
}
