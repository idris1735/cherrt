// Instant Demo Mode: deterministically create + seed a full, believable church
// for a tester and link their phone as senior_pastor. No LLM calls; every row
// ID is generated here and inserted explicitly, so setup is reliable and the
// resulting church looks real in every report and menu. Mirrors the proven
// scratchpad seed scripts. See
// docs/superpowers/specs/2026-07-24-instant-demo-mode-design.md
import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

type Db = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

const iso = (ms: number) => new Date(ms).toISOString();
const daysAgo = (n: number) => iso(Date.now() - n * 86_400_000);
const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "church";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

// Best-effort decorative insert: one failing seed table must never abort setup.
async function seed(db: Db, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  try { await db.from(table).insert(rows); } catch { /* decorative — ignore */ }
}

export async function provisionDemoChurch(
  phone: string,
  personName: string,
  churchName: string,
): Promise<{ workspaceId: string; link: PhoneLink } | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const name = personName.trim() || "Pastor";
  const church = churchName.trim() || "Grace Chapel (Demo)";

  // Idempotency: if this phone already has an active contact, don't double-seed.
  const { data: existing } = await db
    .from("phone_contacts")
    .select("person_id")
    .eq("phone_number", phone)
    .eq("status", "active")
    .maybeSingle();
  if (existing) return null;

  const orgId = randomUUID();
  const workspaceId = randomUUID();
  const personId = randomUUID();
  const slug = slugify(church);

  // ── Core provision — these MUST succeed or the church isn't usable. ──
  const core = await db.from("organizations").insert({
    id: orgId, name: church, status: "active",
    requested_by_phone: phone, requested_by_name: name, requested_city: "Lagos", requested_size: "300",
  });
  if (core.error) return null;

  const wsRes = await db.from("workspaces").insert({
    id: workspaceId, slug, name: church, legal_name: church, city: "Lagos",
    timezone: "Africa/Lagos", organization_id: orgId,
  });
  if (wsRes.error) return null;

  await db.from("people").insert({ id: personId, full_name: name, birth_day: 15, birth_month: 6 });
  await db.from("phone_contacts").insert({
    phone_number: phone, person_id: personId, status: "active", verified_at: new Date().toISOString(),
  });
  const memRes = await db.from("branch_memberships").insert({
    id: randomUUID(), person_id: personId, workspace_id: workspaceId, role: "senior_pastor", status: "active",
  });
  if (memRes.error) return null;
  await db.from("organization_admins").insert({ organization_id: orgId, phone_number: phone, person_id: personId });
  const linkRes = await db.from("whatsapp_phone_links").insert({
    phone_number: phone, workspace_id: workspaceId, workspace_slug: slug,
    workspace_name: church, user_name: name, user_role: "senior_pastor",
  });
  if (linkRes.error) return null;

  // ── Decorative catalogs ──
  await seed(db, "giving_categories", ["Tithes", "Offerings", "Building Fund"].map((n) => ({ workspace_id: workspaceId, name: n })));
  await seed(db, "ministry_units", ["Choir", "Ushering", "Media", "Children's Ministry"].map((n) => ({ workspace_id: workspaceId, name: n })));

  // ── Seeded members ──
  const members = [
    { name: "Pastor Emmanuel Adeyemi", role: "pastor", bd: 14, bm: 3 },
    { name: "Blessing Okafor", role: "finance", bd: 2, bm: 8 },
    { name: "Grace Nwosu", role: "secretary", bd: 21, bm: 11 },
    { name: "Samuel Eze", role: "dept_leader", bd: 9, bm: 5 },
    { name: "Deborah Okon", role: "dept_leader", bd: 30, bm: 1 },
    { name: "Daniel Bello", role: "children", bd: 17, bm: 7 },
    { name: "Faith Adeyemi", role: "member", bd: 25, bm: 7 },
    { name: "Joshua Obi", role: "member", bd: 4, bm: 2 },
    { name: "Mary Ibrahim", role: "member", bd: 12, bm: 9 },
    { name: "Peter Okafor", role: "member", bd: 19, bm: 4 },
    { name: "Esther Musa", role: "member", bd: 7, bm: 12 },
    { name: "John Chukwu", role: "member", bd: 28, bm: 6 },
  ];
  const memberIds = members.map(() => randomUUID());
  await seed(db, "people", members.map((m, i) => ({ id: memberIds[i], full_name: m.name, birth_day: m.bd, birth_month: m.bm })));
  await seed(db, "branch_memberships", members.map((m, i) => ({
    id: randomUUID(), person_id: memberIds[i], workspace_id: workspaceId, role: m.role, status: "active",
  })));

  // ── Giving: last month (8) + this month (14), positive delta ──
  const givers = members.map((m) => m.name).concat([name]);
  const types = ["tithe", "offering", "donation", "pledge"];
  const giving: Record<string, unknown>[] = [];
  const lastAmts = [5000, 10000, 2000, 20000, 3500, 15000, 7500, 25000];
  lastAmts.forEach((amt, i) => giving.push({
    workspace_id: workspaceId, donor_name: givers[i % givers.length], amount: amt,
    giving_type: types[i % 4], channel: "transfer", church_name: church, created_at: daysAgo(38 - i * 2),
  }));
  const thisAmts = [10000, 5000, 20000, 3000, 50000, 7500, 12000, 2500, 30000, 8000, 15000, 4000, 25000, 6000];
  thisAmts.forEach((amt, i) => giving.push({
    workspace_id: workspaceId, donor_name: givers[i % givers.length], amount: amt,
    giving_type: types[i % 4], channel: "transfer", church_name: church, created_at: daysAgo(Math.max(0, 20 - i)),
  }));
  await seed(db, "giving_records", giving);

  // ── Prayer, pastoral care, first-timers ──
  await seed(db, "prayer_requests", [
    { workspace_id: workspaceId, requester_name: "Mary Ibrahim", request: "Please pray for safe delivery, my baby is due next month.", status: "open", created_at: daysAgo(2) },
    { workspace_id: workspaceId, requester_name: "Joshua Obi", request: "Job interview on Monday — pray for favour.", status: "open", created_at: daysAgo(1) },
    { workspace_id: workspaceId, requester_name: "Esther Musa", request: "My mother's health, she's in hospital.", status: "praying", created_at: daysAgo(4) },
    { workspace_id: workspaceId, requester_name: "Peter Okafor", request: "Travelling mercies for the family this weekend.", status: "open", created_at: daysAgo(0) },
  ]);
  await seed(db, "pastoral_care_requests", [
    { workspace_id: workspaceId, requester_name: "Faith Adeyemi", category: "marriage", details: "Would like marriage counselling before the wedding.", status: "open", created_at: daysAgo(3) },
    { workspace_id: workspaceId, requester_name: "John Chukwu", category: "bereavement", details: "Lost his father, needs a pastor to visit.", status: "open", created_at: daysAgo(1) },
  ]);
  await seed(db, "first_timers", [
    { workspace_id: workspaceId, name: "Chidera Okeke", phone: "2348100000021", invited_by: "Grace Nwosu", follow_up_status: "new", created_at: daysAgo(2) },
    { workspace_id: workspaceId, name: "Tunde Bakare", phone: "2348100000022", invited_by: "Samuel Eze", follow_up_status: "contacted", created_at: daysAgo(9) },
    { workspace_id: workspaceId, name: "Amaka Nnaji", phone: "2348100000023", invited_by: "Deborah Okon", follow_up_status: "new", created_at: daysAgo(2) },
    { workspace_id: workspaceId, name: "Ibrahim Sani", phone: null, invited_by: "Peter Okafor", follow_up_status: "joined", created_at: daysAgo(16) },
  ]);

  // ── Events (3) + registrations ──
  const eventIds = [randomUUID(), randomUUID(), randomUUID()];
  await seed(db, "event_records", [
    { id: eventIds[0], workspace_id: workspaceId, title: "Youth Night", venue: "Main Auditorium", event_date: dateOnly(Date.now() + 3 * 86_400_000), guests_expected: 80 },
    { id: eventIds[1], workspace_id: workspaceId, title: "Marriage Enrichment Seminar", venue: "Fellowship Hall", event_date: dateOnly(Date.now() + 10 * 86_400_000), guests_expected: 40 },
    { id: eventIds[2], workspace_id: workspaceId, title: "Workers' Retreat", venue: "Camp Ground, Ibadan", event_date: dateOnly(Date.now() + 24 * 86_400_000), guests_expected: 120 },
  ]);
  await seed(db, "event_registrations", [
    { workspace_id: workspaceId, event_id: eventIds[0], event_title: "Youth Night", attendee_name: "Joshua Obi", status: "registered" },
    { workspace_id: workspaceId, event_id: eventIds[0], event_title: "Youth Night", attendee_name: "Faith Adeyemi", status: "registered" },
    { workspace_id: workspaceId, event_id: eventIds[1], event_title: "Marriage Enrichment Seminar", attendee_name: "Peter Okafor", status: "registered" },
  ]);

  // ── Departments, Sundays, kids, FAQs, volunteers, journeys ──
  await seed(db, "department_memberships", [
    { workspace_id: workspaceId, unit_name: "Choir", member_name: "Faith Adeyemi", status: "pending", created_at: daysAgo(1) },
    { workspace_id: workspaceId, unit_name: "Media", member_name: "Joshua Obi", status: "pending", created_at: daysAgo(2) },
    { workspace_id: workspaceId, unit_name: "Ushering", member_name: "Mary Ibrahim", status: "approved", created_at: daysAgo(20) },
    { workspace_id: workspaceId, unit_name: "Choir", member_name: "Esther Musa", status: "approved", created_at: daysAgo(30) },
  ]);
  const sundays = [
    { d: 5, ad: 142, ch: 34, ft: 5, sv: 3, off: 186500, topic: "Faith that moves mountains" },
    { d: 12, ad: 128, ch: 30, ft: 3, sv: 1, off: 154000, topic: "The generous heart" },
    { d: 19, ad: 156, ch: 41, ft: 7, sv: 4, off: 210000, topic: "New beginnings" },
    { d: 26, ad: 119, ch: 28, ft: 2, sv: 0, off: 132500, topic: "Walking in love" },
  ];
  await seed(db, "services", sundays.map((s) => ({
    workspace_id: workspaceId, service_date: dateOnly(Date.now() - s.d * 86_400_000), service_type: "Sunday Service",
    title: s.topic, preacher: "Pastor Emmanuel Adeyemi", message_topic: s.topic,
    attendance_adults: s.ad, attendance_children: s.ch, first_timers_count: s.ft, salvations_count: s.sv,
    offering_total: s.off, status: "closed", created_by_name: "Grace Nwosu", created_at: daysAgo(s.d),
  })));
  await seed(db, "child_checkins", [
    { workspace_id: workspaceId, child_name: "Zoe Adeyemi", age: 5, allergies: "Peanuts", guardian_name: "Faith Adeyemi", pickup_code: "482913", status: "checked_in", service_label: "Children's Church" },
    { workspace_id: workspaceId, child_name: "Caleb Okafor", age: 8, allergies: null, guardian_name: "Blessing Okafor", pickup_code: "730164", status: "checked_in", service_label: "Children's Church" },
  ]);
  await seed(db, "toolkit_knowledge_articles", [
    { workspace_id: workspaceId, type: "faq", title: "What time is Sunday service?", body: "Two services: First service 8:00am, Second service 10:30am. Children's Church runs during both.", tags: [] },
    { workspace_id: workspaceId, type: "faq", title: "What is the church account number?", body: `${church} — GTBank 0123456789. Use your full name as reference.`, tags: [] },
    { workspace_id: workspaceId, type: "faq", title: "Where is the church located?", body: "12 Grace Avenue, Lekki Phase 1, Lagos. Parking on the left of the main gate.", tags: [] },
    { workspace_id: workspaceId, type: "faq", title: "How do I join a department?", body: "Tell me which one — Choir, Ushering, Media or Children's Ministry — and I'll register your interest.", tags: [] },
  ]);
  await seed(db, "volunteer_needs", [
    { workspace_id: workspaceId, title: "Ushers for Youth Night", when_label: "This Friday, 5pm", slots_needed: 6, status: "open", created_by_name: "Deborah Okon", created_at: daysAgo(1) },
  ]);
  await seed(db, "life_journeys", [
    { workspace_id: workspaceId, journey_type: "marriage_prep", person_name: "Faith Adeyemi", status: "active", created_at: daysAgo(6) },
    { workspace_id: workspaceId, journey_type: "discipleship", person_name: "Ibrahim Sani", status: "active", created_at: daysAgo(12) },
  ]);

  // ── Status-view fuel: pending approvals + an open issue ──
  await seed(db, "workflow_requests", [
    { workspace_id: workspaceId, module_key: "church", request_type: "reimbursement", title: "Diesel for generator", description: "Fuel for Sunday service power.", requester_name: "Samuel Eze", amount: 45000, status: "pending", created_at: daysAgo(1) },
    { workspace_id: workspaceId, module_key: "church", request_type: "reimbursement", title: "Children's Church materials", description: "Craft supplies for July.", requester_name: "Daniel Bello", amount: 18500, status: "pending", created_at: daysAgo(2) },
  ]);
  await seed(db, "toolkit_issue_reports", [
    { workspace_id: workspaceId, title: "AC in main auditorium not cooling", area: "Facilities", severity: "medium", status: "pending", media_count: 0, reported_by: "Grace Nwosu", created_at: daysAgo(2) },
  ]);

  const link: PhoneLink = {
    phoneNumber: phone, userId: null, workspaceId, workspaceSlug: slug,
    workspaceName: church, userName: name, userRole: "senior_pastor",
  };
  return { workspaceId, link };
}
