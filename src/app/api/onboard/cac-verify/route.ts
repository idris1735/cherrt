import { resolveByToken } from "@/lib/services/kyc/applications";
import { monoCacLookup } from "@/lib/services/kyc/mono";
import { isValidItNumber } from "@/lib/onboard-validation";

export const dynamic = "force-dynamic";

// P2-1 — live "CAC verified ✓" badge as the IT/RC number is typed.
// Serves ONLY live onboarding form sessions (token-gated) and throttles
// per IP, because Mono lookups cost money. It never blocks submission —
// the authoritative check still runs server-side on submit.
const hits = new Map<string, number[]>();
const MAX_PER_MINUTE = 6;

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? "").trim();
  const itNumber = String(body?.it_number ?? "").trim();

  if (!token || !(await resolveByToken(token))) {
    return Response.json({ ok: false, error: "This link is invalid or expired." }, { status: 404 });
  }
  if (!isValidItNumber(itNumber)) {
    return Response.json({ ok: false, error: "Not a valid IT/RC number." }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const window = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (window.length >= MAX_PER_MINUTE) {
    return Response.json({ ok: false, error: "Too many checks — give it a minute." }, { status: 429 });
  }
  window.push(now);
  hits.set(ip, window);

  try {
    const res = await monoCacLookup(itNumber);
    if (!res.ok) return Response.json({ ok: true, verified: false, error: res.error });
    const norm = itNumber.replace(/\W/g, "").toLowerCase();
    const match = res.data.find((c) => c.rcNumber && c.rcNumber.replace(/\W/g, "").toLowerCase() === norm) ?? res.data[0];
    if (!match) return Response.json({ ok: true, verified: false });
    return Response.json({ ok: true, verified: true, name: match.approvedName, rcNumber: match.rcNumber, active: !!match.active });
  } catch {
    return Response.json({ ok: true, verified: false, error: "CAC check unavailable right now." });
  }
}
