import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { verificationLevel } from "@/lib/services/identity/verification";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type TrendPeriod = "7d" | "30d" | "90d" | "all";
export type TrendPoint = { bucket: string; churches: number; members: number; giving: number };

const PERIOD_DAYS: Record<Exclude<TrendPeriod, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** Bucket key: day mode → "YYYY-MM-DD"; week mode → Monday of that week. */
function bucketOf(iso: string, mode: "day" | "week"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (mode === "day") return iso.slice(0, 10);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return start.toISOString().slice(0, 10);
}

/** Enumerate bucket keys from lo to hi inclusive (dates as "YYYY-MM-DD"). */
function enumerateBuckets(lo: string, hi: string, mode: "day" | "week"): string[] {
  const step = mode === "day" ? 86400000 : 7 * 86400000;
  const from = Date.parse(`${lo}T00:00:00Z`);
  const to = Date.parse(`${hi}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return [];
  const out: string[] = [];
  for (let t = from; t <= to; t += step) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

const modeFor = (period: TrendPeriod): "day" | "week" => (period === "90d" || period === "all" ? "week" : "day");

/** Shared bucketing over { at, amount } rows → zero-filled bucket series. */
function bucketSeries(period: TrendPeriod, now: Date, rows: { at: string | null; amount: number }[]): { bucket: string; amount: number }[] {
  const valid = rows.filter((r) => r.at && Number.isFinite(new Date(r.at).getTime()));
  if (!valid.length) return [];
  const mode = modeFor(period);
  let buckets: string[];
  if (period === "all") {
    const min = Math.min(...valid.map((r) => new Date(r.at!).getTime()));
    const lo = bucketOf(new Date(min).toISOString(), "week");
    const hi = bucketOf(now.toISOString(), "week");
    buckets = enumerateBuckets(lo, hi, "week");
  } else {
    const since = new Date(now.getTime() - (PERIOD_DAYS[period] - 1) * 86400000);
    const lo = bucketOf(since.toISOString(), mode);
    const hi = bucketOf(now.toISOString(), mode);
    buckets = enumerateBuckets(lo, hi, mode);
  }
  const sums = new Map<string, number>();
  for (const r of valid) {
    const b = bucketOf(r.at!, mode);
    if (buckets.includes(b)) sums.set(b, (sums.get(b) ?? 0) + r.amount);
  }
  return buckets.map((b) => ({ bucket: b, amount: sums.get(b) ?? 0 }));
}

/**
 * Time-bucketed platform growth: new churches, new active memberships, and
 * giving per day (7d/30d) or week (90d/all). Fed by live organizations,
 * branch_memberships and giving_records — zero-filled, no mock data.
 */
export async function platformTrends(period: TrendPeriod = "30d", now: Date = new Date()): Promise<TrendPoint[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const [orgsRes, memRes, givingRes] = await Promise.all([
    db.from("organizations").select("created_at"),
    db.from("branch_memberships").select("created_at, status").eq("status", "active"),
    db.from("giving_records").select("created_at, amount"),
  ]);
  const orgs = (orgsRes.data ?? []) as any[];
  const members = (memRes.data ?? []) as any[];
  const giving = (givingRes.data ?? []) as any[];
  const all: { at: string | null; amount: number; kind: "churches" | "members" | "giving" }[] = [
    ...orgs.map((o) => ({ at: o.created_at, amount: 1, kind: "churches" as const })),
    ...members.map((m) => ({ at: m.created_at, amount: 1, kind: "members" as const })),
    ...giving.map((g) => ({ at: g.created_at, amount: Number(g.amount) || 0, kind: "giving" as const })),
  ];
  if (!all.length) return [];

  const mode = modeFor(period);
  let buckets: string[];
  if (period === "all") {
    const min = Math.min(...all.map((r) => new Date(r.at!).getTime()).filter(Number.isFinite));
    buckets = enumerateBuckets(bucketOf(new Date(min).toISOString(), "week"), bucketOf(now.toISOString(), "week"), "week");
  } else {
    const since = new Date(now.getTime() - (PERIOD_DAYS[period] - 1) * 86400000);
    buckets = enumerateBuckets(bucketOf(since.toISOString(), mode), bucketOf(now.toISOString(), mode), mode);
  }
  const counts = new Map<string, { churches: number; members: number; giving: number }>();
  for (const r of all) {
    if (!r.at) continue;
    if (period !== "all" && new Date(r.at) < new Date(now.getTime() - (PERIOD_DAYS[period] - 1) * 86400000)) continue;
    const b = bucketOf(r.at, mode);
    if (!buckets.includes(b)) continue;
    const c = counts.get(b) ?? { churches: 0, members: 0, giving: 0 };
    if (r.kind === "churches") c.churches += 1;
    else if (r.kind === "members") c.members += 1;
    else c.giving += r.amount;
    counts.set(b, c);
  }
  return buckets.map((b) => ({ bucket: b, ...(counts.get(b) ?? { churches: 0, members: 0, giving: 0 }) }));
}

/** KYC pipeline stage counts — draft → pending → approved / rejected. */
export async function kycFunnel(): Promise<{ draft: number; pending: number; approved: number; rejected: number }> {
  const db = getSupabaseServerClient();
  const empty = { draft: 0, pending: 0, approved: 0, rejected: 0 };
  if (!db) return empty;
  const { data } = await db.from("kyc_applications").select("status");
  const rows = (data ?? []) as any[];
  return {
    draft: rows.filter((r) => r.status === "draft").length,
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };
}

/**
 * Verification split L0/L1/L2. L2 = people provisioned via onboarding whose
 * identity passed a Mono NIN/BVN check (consent_source 'onboarding_form');
 * L1 = number-verified; L0 = the rest. No fake levels.
 */
export async function verificationBreakdown(): Promise<{ l0: number; l1: number; l2: number }> {
  const db = getSupabaseServerClient();
  const empty = { l0: 0, l1: 0, l2: 0 };
  if (!db) return empty;
  const [peopleRes, contactsRes] = await Promise.all([
    db.from("people").select("id, consent_source"),
    db.from("phone_contacts").select("person_id, verified_at, status").eq("status", "active"),
  ]);
  const people = (peopleRes.data ?? []) as any[];
  const contacts = (contactsRes.data ?? []) as any[];
  const verifiedIds = new Set(contacts.filter((c) => c.verified_at).map((c) => c.person_id));
  let l0 = 0, l1 = 0, l2 = 0;
  for (const p of people) {
    if (p.consent_source === "onboarding_form") l2++;
    else if (verifiedIds.has(p.id)) l1++;
    else l0++;
  }
  return { l0, l1, l2 };
}

/** New active memberships per bucket — optionally scoped to one church's branches. */
export async function memberTrend(period: TrendPeriod = "30d", churchId?: string, now: Date = new Date()): Promise<{ bucket: string; members: number }[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const trend = await platformTrends(period, now);
  if (!trend.length) return [];
  const buckets = trend.map((t) => t.bucket);
  let rows: { at: string | null; amount: number }[];
  if (churchId) {
    const wsRes = await db.from("workspaces").select("id").eq("organization_id", churchId);
    const wsIds = new Set(((wsRes.data ?? []) as any[]).map((w) => w.id));
    if (!wsIds.size) return buckets.map((b) => ({ bucket: b, members: 0 }));
    const { data } = await db.from("branch_memberships").select("created_at, status").eq("status", "active").in("workspace_id", [...wsIds]);
    rows = ((data ?? []) as any[]).map((m) => ({ at: m.created_at, amount: 1 }));
  } else {
    const { data } = await db.from("branch_memberships").select("created_at, status").eq("status", "active");
    rows = ((data ?? []) as any[]).map((m) => ({ at: m.created_at, amount: 1 }));
  }
  const series = bucketSeries(period, now, rows);
  if (!series.length) return buckets.map((b) => ({ bucket: b, members: 0 }));
  return series.map((s) => ({ bucket: s.bucket, members: s.amount }));
}

/** Giving summed per bucket — optionally scoped to one church's branches. */
export async function givingTrend(period: TrendPeriod = "30d", churchId?: string, now: Date = new Date()): Promise<{ bucket: string; amount: number }[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];
  let wsIds: Set<string> | null = null;
  if (churchId) {
    const wsRes = await db.from("workspaces").select("id").eq("organization_id", churchId);
    wsIds = new Set(((wsRes.data ?? []) as any[]).map((w) => w.id));
  }
  const { data } = await db.from("giving_records").select("created_at, amount, workspace_id");
  let rows = (data ?? []) as any[];
  if (wsIds) rows = rows.filter((r) => wsIds!.has(r.workspace_id));
  return bucketSeries(period, now, rows.map((r) => ({ at: r.created_at, amount: Number(r.amount) || 0 })));
}

/** One church's headline numbers for its detail dashboard. */
export async function churchStats(id: string): Promise<{ members: number; children: number; firstTimers: number; givingTotal: number; verifiedPct: number; pendingPastoral: number; branches: number } | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const org = (await db.from("organizations").select("id").eq("id", id).maybeSingle()).data as any;
  if (!org) return null;
  const workspaces = ((await db.from("workspaces").select("id").eq("organization_id", id)).data ?? []) as any[];
  const wsIds = workspaces.map((w) => w.id);
  const [memRes, childRes, ftRes, pastRes, givingRes, contactsRes] = await Promise.all([
    db.from("branch_memberships").select("person_id, status").eq("status", "active").in("workspace_id", wsIds),
    db.from("child_profiles").select("id").in("workspace_id", wsIds),
    db.from("first_timers").select("id").in("workspace_id", wsIds),
    db.from("pastoral_care_requests").select("status").in("workspace_id", wsIds),
    db.from("giving_records").select("amount").in("workspace_id", wsIds),
    db.from("phone_contacts").select("person_id, verified_at").eq("status", "active"),
  ]);
  const members = (memRes.data ?? []) as any[];
  const pastoral = (pastRes.data ?? []) as any[];
  const giving = (givingRes.data ?? []) as any[];
  const verifiedIds = new Set(((contactsRes.data ?? []) as any[]).filter((c) => c.verified_at).map((c) => c.person_id));
  const verifiedMembers = members.filter((m) => verifiedIds.has(m.person_id)).length;
  return {
    members: members.length,
    children: ((childRes.data ?? []) as any[]).length,
    firstTimers: ((ftRes.data ?? []) as any[]).length,
    givingTotal: giving.reduce((n, g) => n + (Number(g.amount) || 0), 0),
    verifiedPct: members.length ? Math.round((verifiedMembers / members.length) * 100) : 0,
    pendingPastoral: pastoral.filter((p) => p.status === "open").length,
    branches: wsIds.length,
  };
}

export type FeedEvent = { type: string; title: string; subtitle: string; at: string; href: string | null };

/**
 * Unified, newest-first activity across KYC submissions/decisions, church
 * creations, member adds, first-timers, and data requests. Every event
 * carries a drill-in link.
 */
export async function activityFeed(limit = 10): Promise<FeedEvent[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const [kycRes, orgsRes, memRes, wsRes, ftRes, drRes] = await Promise.all([
    db.from("kyc_applications").select("id, church_legal_name, status, created_at, reviewed_at"),
    db.from("organizations").select("id, name, created_at"),
    db.from("branch_memberships").select("workspace_id, person_id, created_at, status").eq("status", "active"),
    db.from("workspaces").select("id, organization_id, name"),
    db.from("first_timers").select("workspace_id, name, created_at"),
    db.from("data_requests").select("id, kind, note, created_at"),
  ]);
  const kyc = (kycRes.data ?? []) as any[];
  const orgs = (orgsRes.data ?? []) as any[];
  const members = (memRes.data ?? []) as any[];
  const workspaces = (wsRes.data ?? []) as any[];
  const firstTimers = (ftRes.data ?? []) as any[];
  const dataRequests = (drRes.data ?? []) as any[];
  const wsById = new Map(workspaces.map((w) => [w.id, w]));
  const orgName = (wsId: string) => {
    const ws = wsById.get(wsId);
    return ws?.organization_id ? ws.name : null;
  };
  const orgOf = (wsId: string) => {
    const ws = wsById.get(wsId);
    return ws?.organization_id ?? null;
  };

  const personIds = [...new Set(members.map((m) => m.person_id))];
  const personRes = personIds.length ? await db.from("people").select("id, full_name").in("id", personIds) : { data: [] };
  const nameById = new Map(((personRes.data ?? []) as any[]).map((p) => [p.id, p.full_name]));

  const events: FeedEvent[] = [];
  for (const k of kyc) {
    const label = k.church_legal_name || "Unnamed church";
    if (k.status === "approved") events.push({ type: "kyc_approved", title: `${label} — KYC approved`, subtitle: "KYC application", at: k.reviewed_at ?? k.created_at, href: `/admin/kyc/${k.id}` });
    else if (k.status === "rejected") events.push({ type: "kyc_rejected", title: `${label} — KYC rejected`, subtitle: "KYC application", at: k.reviewed_at ?? k.created_at, href: `/admin/kyc/${k.id}` });
    else events.push({ type: "kyc_submitted", title: `${label} — KYC submitted`, subtitle: "KYC application", at: k.created_at, href: `/admin/kyc/${k.id}` });
  }
  for (const o of orgs) events.push({ type: "church_created", title: `${o.name} created`, subtitle: "New church", at: o.created_at, href: `/admin/churches/${o.id}` });
  for (const m of members) {
    const wsName = orgName(m.workspace_id) ?? "a church";
    const orgId = orgOf(m.workspace_id);
    events.push({
      type: "member_added",
      title: `${nameById.get(m.person_id) ?? "Someone"} joined ${wsName}`,
      subtitle: "New member",
      at: m.created_at,
      href: orgId ? `/admin/churches/${orgId}` : null,
    });
  }
  for (const f of firstTimers) {
    const orgId = orgOf(f.workspace_id);
    events.push({
      type: "first_timer",
      title: `${f.name ?? "A guest"} visited ${orgName(f.workspace_id) ?? "a church"}`,
      subtitle: "First-time guest",
      at: f.created_at,
      href: orgId ? `/admin/churches/${orgId}` : null,
    });
  }
  for (const d of dataRequests) {
    events.push({ type: "data_request", title: `Data request — ${d.kind}`, subtitle: d.note ?? "", at: d.created_at, href: "/admin" });
  }
  return events
    .filter((e) => e.at && Number.isFinite(new Date(e.at).getTime()))
    .sort((a, b) => (new Date(a.at) < new Date(b.at) ? 1 : -1))
    .slice(0, limit);
}

export type Kpi = { value: number; delta: number; spark: number[] };

export type OverviewKpis = {
  churches: Kpi;
  members: Kpi;
  giving: Kpi;
  verifiedPct: { value: number };
  pendingKyc: { value: number };
};

export async function platformOverview(period: TrendPeriod = "30d", now: Date = new Date()) {
  const db = getSupabaseServerClient();
  const empty = { churches: { total: 0, active: 0, pending: 0 }, pendingKyc: 0, members: 0, people: { verified: 0, unverified: 0 }, recentKyc: [] as any[], recentChurches: [] as any[], kpis: { churches: { value: 0, delta: 0, spark: [] }, members: { value: 0, delta: 0, spark: [] }, giving: { value: 0, delta: 0, spark: [] }, verifiedPct: { value: 0 }, pendingKyc: { value: 0 } } };
  if (!db) return empty;
  const [orgsRes, memRes, contactsRes, kycRes] = await Promise.all([
    db.from("organizations").select("id, name, status, created_at"),
    db.from("branch_memberships").select("id, status").eq("status", "active"),
    db.from("phone_contacts").select("person_id, verified_at, status").eq("status", "active"),
    db.from("kyc_applications").select("id, church_legal_name, status, created_at"),
  ]);
  const orgs = (orgsRes.data ?? []) as any[];
  const contacts = (contactsRes.data ?? []) as any[];
  const kyc = (kycRes.data ?? []) as any[];
  const verifiedPeople = new Set(contacts.filter((c) => c.verified_at).map((c) => c.person_id));
  const allPeople = new Set(contacts.map((c) => c.person_id));

  // KPI deltas + sparklines: this period vs the previous window of equal length.
  const trends = await platformTrends(period, now);
  const spanMs = period === "all" ? 0 : PERIOD_DAYS[period] * 86400000;
  const prevTrends = spanMs ? await platformTrends(period, new Date(now.getTime() - spanMs)) : [];
  const sum = (rows: TrendPoint[], key: "churches" | "members" | "giving") => rows.reduce((n, r) => n + r[key], 0);
  const spark = (key: "churches" | "members" | "giving") => trends.map((t) => t[key]);
  const delta = (key: "churches" | "members" | "giving") => spanMs ? sum(trends, key) - sum(prevTrends, key) : 0;

  return {
    churches: { total: orgs.length, active: orgs.filter((o) => o.status === "active").length, pending: orgs.filter((o) => o.status === "pending_approval").length },
    pendingKyc: kyc.filter((k) => k.status === "pending").length,
    members: ((memRes.data ?? []) as any[]).length,
    people: { verified: verifiedPeople.size, unverified: allPeople.size - verifiedPeople.size },
    recentKyc: [...kyc].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 5)
      .map((k) => ({ id: k.id, church: k.church_legal_name ?? "—", status: k.status, createdAt: k.created_at })),
    recentChurches: [...orgs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 5)
      .map((o) => ({ id: o.id, name: o.name, status: o.status, createdAt: o.created_at })),
    kpis: {
      churches: { value: orgs.length, delta: delta("churches"), spark: spark("churches") },
      members: { value: ((memRes.data ?? []) as any[]).length, delta: delta("members"), spark: spark("members") },
      giving: { value: sum(trends, "giving"), delta: delta("giving"), spark: spark("giving") },
      verifiedPct: { value: allPeople.size ? Math.round((verifiedPeople.size / allPeople.size) * 100) : 0 },
      pendingKyc: { value: kyc.filter((k) => k.status === "pending").length },
    } satisfies OverviewKpis,
  };
}

export async function listChurches() {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const [orgsRes, wsRes, memRes, givingRes, contactsRes] = await Promise.all([
    db.from("organizations").select("id, name, status, created_at").order("created_at", { ascending: false }),
    db.from("workspaces").select("id, organization_id"),
    db.from("branch_memberships").select("workspace_id, person_id, status").eq("status", "active"),
    db.from("giving_records").select("workspace_id, amount"),
    db.from("phone_contacts").select("person_id, verified_at").eq("status", "active"),
  ]);
  const orgs = (orgsRes.data ?? []) as any[];
  const workspaces = (wsRes.data ?? []) as any[];
  const memberships = (memRes.data ?? []) as any[];
  const giving = (givingRes.data ?? []) as any[];
  const verifiedIds = new Set(((contactsRes.data ?? []) as any[]).filter((c) => c.verified_at).map((c) => c.person_id));
  const wsByOrg = new Map<string, string[]>();
  for (const w of workspaces) { if (!w.organization_id) continue; const a = wsByOrg.get(w.organization_id) ?? []; a.push(w.id); wsByOrg.set(w.organization_id, a); }
  const memByWs = new Map<string, { total: number; personIds: string[] }>();
  for (const m of memberships) {
    const cur = memByWs.get(m.workspace_id) ?? { total: 0, personIds: [] };
    cur.total += 1;
    cur.personIds.push(m.person_id);
    memByWs.set(m.workspace_id, cur);
  }
  const givingByWs = new Map<string, number>();
  for (const g of giving) givingByWs.set(g.workspace_id, (givingByWs.get(g.workspace_id) ?? 0) + (Number(g.amount) || 0));
  return orgs.map((o) => {
    const wsIds = wsByOrg.get(o.id) ?? [];
    const members = wsIds.reduce((n, id) => n + (memByWs.get(id)?.total ?? 0), 0);
    const personIds = wsIds.flatMap((id) => memByWs.get(id)?.personIds ?? []);
    const verified = personIds.filter((pid) => verifiedIds.has(pid)).length;
    return {
      id: o.id, name: o.name, status: o.status, branches: wsIds.length, members,
      givingTotal: wsIds.reduce((n, id) => n + (givingByWs.get(id) ?? 0), 0),
      verifiedPct: members ? Math.round((verified / members) * 100) : 0,
      createdAt: o.created_at,
    };
  });
}

export async function getChurchDetail(id: string) {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const org = (await db.from("organizations").select("*").eq("id", id).maybeSingle()).data as any;
  if (!org) return null;
  const workspaces = ((await db.from("workspaces").select("id, name, city, username, website").eq("organization_id", id)).data ?? []) as any[];
  const wsIds = workspaces.map((w) => w.id);
  const memberships = wsIds.length
    ? (((await db.from("branch_memberships").select("person_id, role, status, created_at").in("workspace_id", wsIds).eq("status", "active")).data ?? []) as any[])
    : [];
  const personIds = [...new Set(memberships.map((m) => m.person_id))];
  const people = personIds.length
    ? (((await db.from("people").select("id, full_name, gender, birthdate, email, marital_status, joined_at").in("id", personIds)).data ?? []) as any[])
    : [];
  const personById = new Map(people.map((p) => [p.id, p]));
  const members = await Promise.all(memberships.map(async (m) => {
    const person = personById.get(m.person_id);
    return {
      name: person?.full_name ?? "Unknown",
      role: m.role,
      level: await verificationLevel(m.person_id),
      joinedAt: m.created_at,
      gender: person?.gender ?? null,
      birthdate: person?.birthdate ?? null,
      email: person?.email ?? null,
      maritalStatus: person?.marital_status ?? null,
    };
  }));

  // Children of this church (via child_profiles + guardianships)
  const children = wsIds.length
    ? await buildChildrenList(db, wsIds)
    : [];

  // Pastoral requests summary
  const pastoralRows = wsIds.length
    ? (((await db.from("pastoral_care_requests").select("id, requester_name, category, details, status, created_at").in("workspace_id", wsIds)).data ?? []) as any[])
    : [];
  const pastoralRequests = {
    total: pastoralRows.length,
    open: pastoralRows.filter((r) => r.status === "open").length,
    scheduled: pastoralRows.filter((r) => r.status === "scheduled").length,
    resolved: pastoralRows.filter((r) => r.status === "resolved").length,
  };

  // Pastoral form submissions (dedication/naming/pre-marital intakes)
  const formSubmissions = wsIds.length
    ? (((await db.from("pastoral_form_submissions").select("id, form_type, status, created_at").in("workspace_id", wsIds)).data ?? []) as any[])
    : [];

  const kycRow = (await db.from("kyc_applications").select("id, status").eq("workspace_id", wsIds[0] ?? "___none___").maybeSingle()).data as any;
  return {
    org, workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, city: w.city ?? null })), members, children,
    pastoralRequests,
    pastoralCareRows: pastoralRows.map((r) => ({ id: r.id, requesterName: r.requester_name ?? "", category: r.category ?? "general", details: r.details ?? "", status: r.status, createdAt: r.created_at })),
    formSubmissions: formSubmissions.map((s) => ({ id: s.id, formType: s.form_type, status: s.status, createdAt: s.created_at })),
    kyc: kycRow ? { id: kycRow.id, status: kycRow.status } : null,
  };
}

/** Resolve children for a set of workspace IDs — name, guardian, class, allergies. */
async function buildChildrenList(db: any, wsIds: string[]) {
  const profiles = (((await db.from("child_profiles").select("person_id, allergies, medical_notes, classroom, age_group").in("workspace_id", wsIds)).data ?? []) as any[]);
  if (!profiles.length) return [];
  const childIds = profiles.map((c) => c.person_id);
  const childPeople = (((await db.from("people").select("id, full_name").in("id", childIds)).data ?? []) as any[]);
  const nameById = new Map(childPeople.map((p) => [p.id, p.full_name]));
  const guardianships = (((await db.from("guardianships").select("child_person_id, guardian_person_id, relationship, is_primary").in("child_person_id", childIds).in("workspace_id", wsIds)).data ?? []) as any[]);
  const guardianIds = [...new Set(guardianships.map((g) => g.guardian_person_id))];
  const guardianPeople = guardianIds.length ? (((await db.from("people").select("id, full_name").in("id", guardianIds)).data ?? []) as any[]) : [];
  const guardianNameById = new Map(guardianPeople.map((p) => [p.id, p.full_name]));
  const guardianByChild = new Map<string, { name: string; relationship: string }>();
  for (const g of guardianships) {
    if (!guardianByChild.has(g.child_person_id)) {
      guardianByChild.set(g.child_person_id, { name: guardianNameById.get(g.guardian_person_id) ?? "Unknown", relationship: g.relationship });
    }
  }
  return profiles.map((c) => {
    const guardian = guardianByChild.get(c.person_id);
    return {
      name: nameById.get(c.person_id) ?? "Unknown",
      guardian: guardian?.name ?? "—",
      relationship: guardian?.relationship ?? null,
      allergies: c.allergies ?? "",
      medicalNotes: c.medical_notes ?? "",
      classroom: c.classroom ?? c.age_group ?? "",
    };
  });
}

export async function listDataRequests(limit = 50, includeDone = false) {
  const db = getSupabaseServerClient();
  if (!db) return [];
  let query = db
    .from("data_requests")
    .select("id, person_id, kind, status, note, created_at");
  if (!includeDone) query = query.eq("status", "open");
  query = query.order("created_at", { ascending: true }).limit(limit);
  const { data } = await query;
  const rows = (data ?? []) as any[];
  const personIds = [...new Set(rows.map((r) => r.person_id).filter(Boolean))];
  const people = personIds.length ? (((await db.from("people").select("id, full_name").in("id", personIds)).data ?? []) as any[]) : [];
  const nameById = new Map(people.map((p) => [p.id, p.full_name]));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    note: r.note ?? "",
    personName: r.person_id ? nameById.get(r.person_id) ?? "Unknown" : "Unknown",
    createdAt: r.created_at,
  }));
}

export async function getPersonDetail(personId: string) {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const person = (await db.from("people").select("*").eq("id", personId).maybeSingle()).data as any;
  if (!person) return null;

  const [memberships, guardianships, milestones, pastoralRequests, prayerRequests, dataRequests, givingRecords, childGuardianships, phoneContacts] = await Promise.all([
    (db.from("branch_memberships").select("workspace_id, role, status, created_at").eq("person_id", personId)).then((r: any) => (r.data ?? []) as any[]),
    (db.from("guardianships").select("child_person_id, relationship, is_primary").eq("guardian_person_id", personId)).then((r: any) => (r.data ?? []) as any[]),
    (db.from("person_milestones").select("type, occurred_on, details").eq("person_id", personId).order("occurred_on", { ascending: false })).then((r: any) => (r.data ?? []) as any[]),
    (db.from("pastoral_care_requests").select("id, category, details, status, created_at").eq("person_id", personId)).then((r: any) => (r.data ?? []) as any[]),
    (db.from("prayer_requests").select("id, request, is_anonymous, status, created_at").eq("person_id", personId).order("created_at", { ascending: false })).then((r: any) => (r.data ?? []) as any[]),
    (db.from("data_requests").select("id, kind, status, note, created_at").eq("person_id", personId).order("created_at", { ascending: false })).then((r: any) => (r.data ?? []) as any[]),
    (db.from("giving_records").select("id, amount, giving_type, service, created_at").eq("person_id", personId).order("created_at", { ascending: false })).then((r: any) => (r.data ?? []) as any[]),
    (db.from("guardianships").select("guardian_person_id, relationship, is_primary").eq("child_person_id", personId)).then((r: any) => (r.data ?? []) as any[]),
    (db.from("phone_contacts").select("phone_number, verified_at, opted_out, status").eq("person_id", personId).eq("status", "active")).then((r: any) => (r.data ?? []) as any[]),
  ]);

  // Resolve memberships → church names + verification levels
  const wsIds = [...new Set(memberships.map((m) => m.workspace_id))];
  const workspaces = wsIds.length ? (((await db.from("workspaces").select("id, name, organization_id").in("id", wsIds)).data ?? []) as any[]) : [];
  const orgIds = [...new Set(workspaces.map((w) => w.organization_id).filter(Boolean))];
  const orgs = orgIds.length ? (((await db.from("organizations").select("id, name").in("id", orgIds)).data ?? []) as any[]) : [];
  const orgById = new Map(orgs.map((o) => [o.id, o.name]));
  const wsById = new Map(workspaces.map((w) => [w.id, w]));
  const resolvedMemberships = await Promise.all(memberships.map(async (m) => {
    const ws = wsById.get(m.workspace_id);
    return {
      church: (ws?.organization_id ? orgById.get(ws.organization_id) : undefined) ?? ws?.name ?? "Unknown",
      role: m.role,
      verificationLevel: await verificationLevel(personId),
      joinedAt: m.created_at,
    };
  }));

  // Resolve guardian-of children names
  const childIds = [...new Set(guardianships.map((g) => g.child_person_id))];
  const childPeople = childIds.length ? (((await db.from("people").select("id, full_name").in("id", childIds)).data ?? []) as any[]) : [];
  const childNameById = new Map(childPeople.map((p) => [p.id, p.full_name]));
  const guardianOf = guardianships.map((g) => ({
    childName: childNameById.get(g.child_person_id) ?? "Unknown",
    relationship: g.relationship,
    isPrimary: !!g.is_primary,
  }));

  // Resolve who guards THIS person (family tab, when the person is a child)
  const guardianIds = [...new Set(childGuardianships.map((g) => g.guardian_person_id))];
  const guardianPeople = guardianIds.length ? (((await db.from("people").select("id, full_name").in("id", guardianIds)).data ?? []) as any[]) : [];
  const guardianNameById = new Map(guardianPeople.map((p) => [p.id, p.full_name]));
  const guardians = childGuardianships.map((g) => ({
    guardianName: guardianNameById.get(g.guardian_person_id) ?? "Unknown",
    relationship: g.relationship,
    isPrimary: !!g.is_primary,
  }));

  return {
    person,
    memberships: resolvedMemberships,
    guardianOf,
    guardians,
    milestones: milestones.map((m) => ({ type: m.type, occurredOn: m.occurred_on, details: m.details ?? {} })),
    pastoralRequests: pastoralRequests.map((r) => ({ id: r.id, category: r.category, details: r.details ?? "", status: r.status, createdAt: r.created_at })),
    prayerRequests: prayerRequests.map((r) => ({ id: r.id, request: r.request, isAnonymous: !!r.is_anonymous, status: r.status, createdAt: r.created_at })),
    dataRequests: dataRequests.map((r) => ({ id: r.id, kind: r.kind, status: r.status, note: r.note ?? "", createdAt: r.created_at })),
    givingRecords: givingRecords.map((g) => ({ id: g.id, amount: Number(g.amount) || 0, givingType: g.giving_type, service: g.service, createdAt: g.created_at })),
    givingTotal: givingRecords.reduce((n, g) => n + (Number(g.amount) || 0), 0),
    // Real phone + consent state — the consent panel reads these, never hardcoded dots
    phones: phoneContacts.map((c) => ({ phone: c.phone_number, verified: !!c.verified_at, optedOut: !!c.opted_out })),
    consent: {
      source: person.consent_source ?? null,
      version: person.consent_version ?? null,
      at: person.consent_at ?? null,
      optedOut: phoneContacts.some((c) => c.opted_out),
    },
  };
}

export async function listPeople() {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const [peopleRes, contactsRes, membershipsRes, workspacesRes, orgsRes] = await Promise.all([
    db.from("people").select("id, full_name"),
    db.from("phone_contacts").select("person_id, phone_number, verified_at").eq("status", "active"),
    db.from("branch_memberships").select("person_id, workspace_id, role").eq("status", "active"),
    db.from("workspaces").select("id, name, organization_id"),
    db.from("organizations").select("id, name"),
  ]);
  const people = (peopleRes.data ?? []) as any[];
  const contacts = (contactsRes.data ?? []) as any[];
  const memberships = (membershipsRes.data ?? []) as any[];
  const workspaces = (workspacesRes.data ?? []) as any[];
  const orgs = (orgsRes.data ?? []) as any[];

  const wsById = new Map(workspaces.map((w) => [w.id, w]));
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const contactsByPerson = new Map<string, any[]>();
  for (const c of contacts) {
    const a = contactsByPerson.get(c.person_id) ?? [];
    a.push(c);
    contactsByPerson.set(c.person_id, a);
  }
  const membershipsByPerson = new Map<string, any[]>();
  for (const m of memberships) {
    const a = membershipsByPerson.get(m.person_id) ?? [];
    a.push(m);
    membershipsByPerson.set(m.person_id, a);
  }

  return people.map((p) => {
    const personContacts = contactsByPerson.get(p.id) ?? [];
    const personMemberships = membershipsByPerson.get(p.id) ?? [];
    const verified = personContacts.some((c) => c.verified_at);
    return {
      id: p.id,
      name: p.full_name,
      phones: personContacts.map((c) => ({ phone: c.phone_number, verified: !!c.verified_at })),
      verified,
      churches: personMemberships.map((m) => {
        const ws = wsById.get(m.workspace_id);
        const org = ws ? orgById.get(ws.organization_id) : undefined;
        return { workspaceId: m.workspace_id, churchName: org?.name ?? ws?.name ?? "Unknown", role: m.role };
      }),
    };
  });
}

/** Command-palette search: top churches + people by name (case-insensitive). */
export async function adminSearch(q: string): Promise<{ churches: { id: string; name: string; href: string }[]; people: { id: string; name: string; href: string }[] }> {
  const db = getSupabaseServerClient();
  const empty = { churches: [], people: [] };
  const t = q.trim().toLowerCase();
  if (!db || !t) return empty;
  const [orgsRes, peopleRes] = await Promise.all([
    db.from("organizations").select("id, name"),
    db.from("people").select("id, full_name"),
  ]);
  const orgs = (orgsRes.data ?? []) as any[];
  const people = (peopleRes.data ?? []) as any[];
  return {
    churches: orgs.filter((o) => String(o.name ?? "").toLowerCase().includes(t)).slice(0, 6).map((o) => ({ id: o.id, name: o.name, href: `/admin/churches/${o.id}` })),
    people: people.filter((p) => String(p.full_name ?? "").toLowerCase().includes(t)).slice(0, 6).map((p) => ({ id: p.id, name: p.full_name, href: `/admin/people/${p.id}` })),
  };
}
