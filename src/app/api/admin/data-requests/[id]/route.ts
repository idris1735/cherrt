import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";

export const dynamic = "force-dynamic";
const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!(await platformAdminEmail(bearer(req)))) return Response.json({ error: "Not authorized." }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServerClient();
  if (!db) return Response.json({ error: "storage unavailable" }, { status: 500 });
  const { error } = await db
    .from("data_requests")
    .update({ status: "done", resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
