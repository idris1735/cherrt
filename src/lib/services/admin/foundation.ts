import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { verificationLevel } from "@/lib/services/identity/verification";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function platformOverview() {
  const db = getSupabaseServerClient();
  const empty = { churches: { total: 0, active: 0, pending: 0 }, pendingKyc: 0, members: 0, people: { verified: 0, unverified: 0 }, recentKyc: [] as any[], recentChurches: [] as any[] };
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
  return {
    churches: { total: orgs.length, active: orgs.filter((o) => o.status === "active").length, pending: orgs.filter((o) => o.status === "pending_approval").length },
    pendingKyc: kyc.filter((k) => k.status === "pending").length,
    members: ((memRes.data ?? []) as any[]).length,
    people: { verified: verifiedPeople.size, unverified: allPeople.size - verifiedPeople.size },
    recentKyc: [...kyc].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 5)
      .map((k) => ({ id: k.id, church: k.church_legal_name ?? "—", status: k.status, createdAt: k.created_at })),
    recentChurches: [...orgs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 5)
      .map((o) => ({ id: o.id, name: o.name, status: o.status, createdAt: o.created_at })),
  };
}

export async function listChurches() {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const orgs = ((await db.from("organizations").select("id, name, status, created_at").order("created_at", { ascending: false })).data ?? []) as any[];
  const workspaces = ((await db.from("workspaces").select("id, organization_id")).data ?? []) as any[];
  const memberships = ((await db.from("branch_memberships").select("workspace_id, status").eq("status", "active")).data ?? []) as any[];
  const wsByOrg = new Map<string, string[]>();
  for (const w of workspaces) { if (!w.organization_id) continue; const a = wsByOrg.get(w.organization_id) ?? []; a.push(w.id); wsByOrg.set(w.organization_id, a); }
  const memByWs = new Map<string, number>();
  for (const m of memberships) memByWs.set(m.workspace_id, (memByWs.get(m.workspace_id) ?? 0) + 1);
  return orgs.map((o) => {
    const wsIds = wsByOrg.get(o.id) ?? [];
    return { id: o.id, name: o.name, status: o.status, branches: wsIds.length, members: wsIds.reduce((n, id) => n + (memByWs.get(id) ?? 0), 0), createdAt: o.created_at };
  });
}

export async function getChurchDetail(id: string) {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const org = (await db.from("organizations").select("*").eq("id", id).maybeSingle()).data as any;
  if (!org) return null;
  const workspaces = ((await db.from("workspaces").select("id, name, city").eq("organization_id", id)).data ?? []) as any[];
  const wsIds = workspaces.map((w) => w.id);
  const memberships = wsIds.length
    ? (((await db.from("branch_memberships").select("person_id, role, status, created_at").in("workspace_id", wsIds).eq("status", "active")).data ?? []) as any[])
    : [];
  const personIds = [...new Set(memberships.map((m) => m.person_id))];
  const people = personIds.length ? (((await db.from("people").select("id, full_name").in("id", personIds)).data ?? []) as any[]) : [];
  const nameById = new Map(people.map((p) => [p.id, p.full_name]));
  const members = await Promise.all(memberships.map(async (m) => ({
    name: nameById.get(m.person_id) ?? "Unknown",
    role: m.role,
    level: await verificationLevel(m.person_id),
    joinedAt: m.created_at,
  })));
  const kycRow = (await db.from("kyc_applications").select("id, status").eq("workspace_id", wsIds[0] ?? "___none___").maybeSingle()).data as any;
  return { org, workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, city: w.city ?? null })), members, kyc: kycRow ? { id: kycRow.id, status: kycRow.status } : null };
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
