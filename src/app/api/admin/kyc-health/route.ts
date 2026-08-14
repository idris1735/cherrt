import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";

export const dynamic = "force-dynamic";
const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;

// Live third-party health, checked from the production runtime (where the
// encrypted env vars actually exist). Never prints secret values.

async function resendStatus(): Promise<{ configured: boolean; domains: string[]; note: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { configured: false, domains: [], note: "RESEND_API_KEY is not set — email codes cannot send." };
  try {
    const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return { configured: true, domains: [], note: `Resend API HTTP ${res.status} — the key may be invalid.` };
    const j = (await res.json().catch(() => null)) as { data?: { name: string; status: string }[] } | null;
    const domains = (j?.data ?? []).map((d) => `${d.name} (${d.status})`);
    return {
      configured: true,
      domains,
      note: domains.length === 0 ? "No domains verified — any from-address will be rejected until you verify one in Resend." : "",
    };
  } catch (e) {
    return { configured: true, domains: [], note: e instanceof Error ? e.message : "network error" };
  }
}

async function monoStatus(): Promise<{ configured: boolean; probe: string }> {
  const key = process.env.MONO_SECRET_KEY;
  if (!key) return { configured: false, probe: "MONO_SECRET_KEY is not set — CAC/NIN lookups cannot run." };
  try {
    const res = await fetch("https://api.withmono.com/v3/lookup/cac?search=RCCG", {
      headers: { "mono-sec-key": key, "Content-Type": "application/json" },
    });
    const text = await res.text();
    return {
      configured: true,
      probe: res.ok ? `Mono CAC probe OK (HTTP ${res.status})` : `Mono CAC probe HTTP ${res.status} — ${text.slice(0, 200)}`,
    };
  } catch (e) {
    return { configured: true, probe: e instanceof Error ? e.message : "network error" };
  }
}

async function whatsappStatus(): Promise<{ configured: boolean; numberId: string | null; note: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !id) return { configured: false, numberId: null, note: "WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set." };
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${id}?fields=display_phone_number,verified_name,quality_rating`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { configured: true, numberId: id, note: `Graph API HTTP ${res.status} — the token may be expired or revoked.` };
    const j = (await res.json().catch(() => null)) as { display_phone_number?: string; verified_name?: string } | null;
    return {
      configured: true,
      numberId: id,
      note: `Line ${j?.display_phone_number ?? "?"}${j?.verified_name ? ` (${j.verified_name})` : ""} — OK`,
    };
  } catch (e) {
    return { configured: true, numberId: id, note: e instanceof Error ? e.message : "network error" };
  }
}

export async function GET(req: Request): Promise<Response> {
  if (!(await platformAdminEmail(bearer(req)))) return Response.json({ error: "Not authorized." }, { status: 401 });
  const [resend, mono, whatsapp] = await Promise.all([resendStatus(), monoStatus(), whatsappStatus()]);
  return Response.json({ checkedAt: new Date().toISOString(), resend, mono, whatsapp });
}
