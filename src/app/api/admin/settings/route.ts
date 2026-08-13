import { platformAdminEmail, platformAdminAllowlist } from "@/lib/services/kyc/admin-auth";

export const dynamic = "force-dynamic";
const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;

/** Read-only view of the real platform-admin allowlist (env + built-ins). */
export async function GET(req: Request): Promise<Response> {
  if (!(await platformAdminEmail(bearer(req)))) return Response.json({ error: "Not authorized." }, { status: 401 });
  const allowlist = platformAdminAllowlist();
  const envFirst = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)[0] ?? null;
  return Response.json({ allowlist, superAdmin: envFirst });
}