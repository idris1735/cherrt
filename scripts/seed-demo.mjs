// Seed 2–3 approved, populated churches so a new user can see how Chertt works:
// text "JOIN <code>" to the number to join one of them, and the admin console
// already tells a full story. Owner-triggered only — never auto-runs.
//
//   npm run seed-demo        (run `npm run reset-demo` first for a clean slate)

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
try {
  for (const line of readFileSync(resolve(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*?)\r?$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (m[1] === "NEXT_PUBLIC_SUPABASE_URL" && !SUPABASE_URL) SUPABASE_URL = value;
    if (m[1] === "SUPABASE_SERVICE_ROLE_KEY" && !SERVICE_KEY) SERVICE_KEY = value;
  }
} catch { /* use process env only */ }

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (check .env.local).");
  process.exit(1);
}

async function insert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`${table} → ${res.status}: ${await res.text()}`);
}

const daysAgo = (n) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
const GIVING_TYPES = ["tithe", "offering", "donation", "pledge"];

// One reusable church builder. Each config makes a full, believable church.
async function seedChurch(cfg) {
  const orgId = randomUUID();
  const wsId = randomUUID();
  await insert("organizations", {
    id: orgId, name: cfg.name, status: "active",
    requested_by_phone: cfg.pastor.phone, requested_by_name: cfg.pastor.name,
    requested_city: cfg.city, requested_size: String(cfg.size), approved_by: "demo-seed",
    approved_at: daysAgo(cfg.ageDays), created_at: daysAgo(cfg.ageDays),
  });
  await insert("workspaces", {
    id: wsId, slug: cfg.slug, name: `${cfg.name} HQ`, legal_name: cfg.name, city: cfg.city,
    timezone: "Africa/Lagos", organization_id: orgId, join_code: cfg.joinCode, created_at: daysAgo(cfg.ageDays),
  });
  for (const name of ["Choir", "Ushering", "Media", "Children", "Prayer"]) {
    await insert("ministry_units", { id: randomUUID(), workspace_id: wsId, name });
  }

  // Pastor
  const pastorId = randomUUID();
  await insert("people", { id: pastorId, full_name: cfg.pastor.name, gender: cfg.pastor.gender, marital_status: "married", joined_at: daysAgo(cfg.ageDays), created_at: daysAgo(cfg.ageDays) });
  await insert("phone_contacts", { id: randomUUID(), person_id: pastorId, phone_number: cfg.pastor.phone, status: "active", verified_at: daysAgo(cfg.ageDays) });
  await insert("branch_memberships", { id: randomUUID(), person_id: pastorId, workspace_id: wsId, role: "senior_pastor", status: "active", created_at: daysAgo(cfg.ageDays) });

  // Members
  const memberIds = [];
  for (const m of cfg.members) {
    const pid = randomUUID();
    memberIds.push(pid);
    await insert("people", { id: pid, full_name: m.name, gender: m.gender, birthdate: m.birthdate ?? null, email: m.email ?? null, joined_at: daysAgo(m.days), created_at: daysAgo(m.days) });
    await insert("phone_contacts", { id: randomUUID(), person_id: pid, phone_number: m.phone, status: "active", verified_at: m.verified ? daysAgo(m.days) : null });
    await insert("branch_memberships", { id: randomUUID(), person_id: pid, workspace_id: wsId, role: m.role, status: "active", created_at: daysAgo(m.days) });
  }

  // A child + guardianship (first member is the guardian)
  if (cfg.child && memberIds[0]) {
    const childId = randomUUID();
    await insert("people", { id: childId, full_name: cfg.child.name, is_minor: true });
    await insert("child_profiles", { id: randomUUID(), person_id: childId, workspace_id: wsId, allergies: cfg.child.allergies ?? "none", classroom: cfg.child.classroom });
    await insert("guardianships", { id: randomUUID(), child_person_id: childId, guardian_person_id: memberIds[0], relationship: "parent", is_primary: true, can_pickup: true, workspace_id: wsId });
    await insert("person_milestones", { id: randomUUID(), person_id: childId, workspace_id: wsId, type: "child_dedication", occurred_on: daysAgo(5), details: { via: "seed" } });
  }

  // A first-timer awaiting follow-up (first_timers is name/phone-based —
  // no person_id column, no people row needed).
  if (cfg.firstTimer) {
    await insert("first_timers", {
      id: randomUUID(), workspace_id: wsId, name: cfg.firstTimer.name, phone: cfg.firstTimer.phone,
      invited_by: cfg.pastor.name, follow_up_status: "new", created_at: daysAgo(1),
    });
  }

  // Milestones + giving story
  if (memberIds[0]) await insert("person_milestones", { id: randomUUID(), person_id: memberIds[0], workspace_id: wsId, type: "joined_membership", occurred_on: daysAgo(cfg.members[0].days), details: { via: "seed" } });
  if (memberIds[1]) await insert("person_milestones", { id: randomUUID(), person_id: memberIds[1], workspace_id: wsId, type: "baptism", occurred_on: daysAgo(3), details: {} });

  let total = 0;
  for (let i = 0; i < cfg.givingCount; i++) {
    const amount = [5000, 10000, 15000, 25000, 30000, 40000, 50000][i % 7];
    total += amount;
    const donor = cfg.members[i % cfg.members.length]?.name ?? "Anonymous";
    await insert("giving_records", { id: randomUUID(), workspace_id: wsId, donor_name: i % 4 === 3 ? "Anonymous" : donor, amount, giving_type: GIVING_TYPES[i % 4], channel: "manual-entry", service: "giving", created_at: daysAgo(cfg.givingCount - i) });
  }

  // An open pastoral request so leaders have something to see
  if (memberIds[0]) {
    await insert("pastoral_care_requests", {
      id: randomUUID(), workspace_id: wsId, requester_name: cfg.members[0].name,
      category: "marriage", details: "Pre-marital counselling booking", status: "open", created_at: daysAgo(1),
    });
  }

  return { name: cfg.name, code: cfg.joinCode, members: cfg.members.length + 1, giving: total, city: cfg.city };
}

const CHURCHES = [
  {
    name: "Grace Chapel Assembly", city: "Lagos", slug: "grace-chapel-assembly", joinCode: "GRACE001", size: 450, ageDays: 60, givingCount: 6,
    pastor: { name: "Ruth Adeyemi", gender: "female", phone: "+2348001110001" },
    members: [
      { name: "Ada Obi", gender: "female", phone: "+2348001110002", role: "secretary", birthdate: "1994-06-12", email: "ada@grace.ng", verified: true, days: 40 },
      { name: "Sam Eze", gender: "male", phone: "+2348001110003", role: "finance", verified: true, days: 30 },
      { name: "Ngozi Ada", gender: "female", phone: "+2348001110004", role: "dept_leader", verified: false, days: 20 },
    ],
    child: { name: "Amara Obi", allergies: "peanuts", classroom: "Little Stars (4–6)" },
    firstTimer: { name: "Tunde Bakare", phone: "+2348001110009" },
  },
  {
    name: "Covenant House Abuja", city: "Abuja", slug: "covenant-house-abuja", joinCode: "COVEN002", size: 320, ageDays: 45, givingCount: 5,
    pastor: { name: "Emeka Nwosu", gender: "male", phone: "+2348002220001" },
    members: [
      { name: "Blessing Okon", gender: "female", phone: "+2348002220002", role: "children", verified: true, days: 25 },
      { name: "David Musa", gender: "male", phone: "+2348002220003", role: "member", verified: true, days: 15 },
    ],
    child: { name: "Joy Okon", allergies: "none", classroom: "Sunbeams (7–9)" },
    firstTimer: { name: "Sarah Bello", phone: "+2348002220009" },
  },
  {
    name: "Daystar Christian Centre", city: "Lagos", slug: "daystar-christian-centre", joinCode: "DAYSTAR3", size: 780, ageDays: 90, givingCount: 7,
    pastor: { name: "Sam Adeyemi", gender: "male", phone: "+2348003330001" },
    members: [
      { name: "Funke Alabi", gender: "female", phone: "+2348003330002", role: "usher", verified: true, days: 50 },
      { name: "Chidi Umeh", gender: "male", phone: "+2348003330003", role: "media", verified: false, days: 10 },
    ],
    child: null,
    firstTimer: { name: "Grace Etim", phone: "+2348003330009" },
  },
];

console.log("🌱 Seeding demo churches…\n");
const results = [];
for (const c of CHURCHES) {
  process.stdout.write(`   • ${c.name} (${c.city})… `);
  results.push(await seedChurch(c));
  console.log("done");
}

console.log("\n✅ Seeded " + results.length + " churches. Join any of them from WhatsApp:\n");
for (const r of results) {
  console.log(`   ${r.name} — ${r.city}`);
  console.log(`      → text  JOIN ${r.code}  to the Chertt number to join`);
  console.log(`      (${r.members} people, ₦${r.giving.toLocaleString("en-NG")} given)\n`);
}
console.log("Tip: run `npm run reset-demo` first for a clean slate, then this to repopulate.");
