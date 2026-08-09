// Mono Lookup API client (CAC / NIN). Server-side only. The mono-sec-key's
// prefix (test_sk/live_sk) selects sandbox vs live — same base URL.
// Docs: https://docs.mono.co/docs/lookup/cac-lookup , /nin-lookup
/* eslint-disable @typescript-eslint/no-explicit-any */
const BASE = "https://api.withmono.com";

export type MonoCompany = { id: string; approvedName: string; rcNumber: string; classification: string; active: boolean };
export type MonoTrustee = { surname: string; firstname: string };
export type MonoNin = { firstname: string; surname: string; middlename?: string; birthdate?: string; phone?: string; photoBase64?: string };
export type MonoResult<T> = { ok: true; data: T } | { ok: false; error: string };

function key(): string { return process.env.MONO_SECRET_KEY ?? ""; }
function headers(): Record<string, string> { return { "mono-sec-key": key(), "Content-Type": "application/json" }; }
function unwrap(json: unknown): unknown { return (json as { data?: unknown })?.data ?? json; }

async function call<T>(url: string, init: RequestInit, map: (raw: unknown) => T): Promise<MonoResult<T>> {
  if (!key()) return { ok: false, error: "Mono key not configured" };
  try {
    const res = await fetch(url, init);
    if (!res.ok) return { ok: false, error: `Mono ${res.status}: ${await res.text()}` };
    return { ok: true, data: map(unwrap(await res.json())) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mono request failed" };
  }
}

export function monoCacLookup(search: string): Promise<MonoResult<MonoCompany[]>> {
  return call(`${BASE}/v3/lookup/cac?search=${encodeURIComponent(search)}`, { method: "GET", headers: headers() }, (raw) =>
    ((raw as any[]) ?? []).map((c: any) => ({ id: String(c.id ?? ""), approvedName: c.approved_name ?? "", rcNumber: c.rc_number ?? "", classification: c.classification ?? "", active: !!c.active })),
  );
}

export function monoCacTrustees(companyId: string): Promise<MonoResult<MonoTrustee[]>> {
  return call(`${BASE}/v3/lookup/cac/company/${encodeURIComponent(companyId)}/directors`, { method: "GET", headers: headers() }, (raw) =>
    ((raw as any[]) ?? []).map((d: any) => ({ surname: d.surname ?? "", firstname: d.firstname ?? "" })),
  );
}

export function monoNinLookup(nin: string): Promise<MonoResult<MonoNin>> {
  return call(`${BASE}/v3/lookup/nin`, { method: "POST", headers: headers(), body: JSON.stringify({ nin }) }, (raw) => {
    const d = raw as any;
    return { firstname: d.firstname ?? "", surname: d.surname ?? "", middlename: d.middlename ?? undefined, birthdate: d.birthdate ?? undefined, phone: d.telephoneno ?? undefined, photoBase64: d.photo ?? undefined };
  });
}
