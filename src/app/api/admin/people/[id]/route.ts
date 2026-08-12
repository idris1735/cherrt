import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";
import { getPersonDetail } from "@/lib/services/admin/foundation";

export const dynamic = "force-dynamic";
const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await platformAdminEmail(bearer(req)))) return Response.json({ error: "Not authorized." }, { status: 401 });
  const { id } = await params;
  const person = await getPersonDetail(id);
  if (!person) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ person });
}
