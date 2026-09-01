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

// BVN lookup — returns the same core identity fields as NIN (BVN carries no
// photo). Field names are handled defensively (snake_case / camelCase) since
// Mono's BVN payload differs slightly from NIN. NOTE: if the account's Mono plan
// gates BVN behind the initiate/verify OTP flow, this basic lookup returns an
// error and the KYC check degrades to manual review (it's guarded) — that OTP
// flow is a follow-up if needed.
export function monoBvnLookup(bvn: string): Promise<MonoResult<MonoNin>> {
  return call(`${BASE}/v3/lookup/bvn`, { method: "POST", headers: headers(), body: JSON.stringify({ bvn }) }, (raw) => {
    const d = raw as any;
    return {
      firstname: d.firstname ?? d.first_name ?? "",
      surname: d.surname ?? d.last_name ?? "",
      middlename: d.middlename ?? d.middle_name ?? undefined,
      birthdate: d.birthdate ?? d.dob ?? d.date_of_birth ?? undefined,
      phone: d.telephoneno ?? d.phone ?? d.phone_number ?? undefined,
      photoBase64: d.photo ?? d.image ?? undefined,
    };
  });
}
