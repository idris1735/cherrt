// Seed ONE approved, populated church so the console tells the full story even
// if live capture stumbles mid-demo. Owner-triggered only — never auto-runs.
//
//   npm run seed-demo

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

try {
  for (const line of readFileSync(resolve(__dirname, "..", ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    const value = raw.trim().replace(/^["']|["']$/g, "");
    if (key === "NEXT_PUBLIC_SUPABASE_URL" && !SUPABASE_URL) SUPABASE_URL = value;
    if (key === "SUPABASE_SERVICE_ROLE_KEY" && !SERVICE_KEY) SERVICE_KEY = value;
  }
} catch { /* use process env only */ }

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

async function insert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`${table} → ${res.status}: ${await res.text()}`);
}

const now = new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

const orgId = randomUUID();
const wsId = randomUUID();
const pastorId = randomUUID();
const memberAdaId = randomUUID();
const memberSamId = randomUUID();
const firstTimerId = randomUUID();
const childId = randomUUID();

console.log("🌱 Seeding one approved church for the demo…");

// Church
await insert("organizations", {
  id: orgId, name: "Grace Chapel Assembly", status: "active",
  requested_by_phone: "+2348001111111", requested_by_name: "Pastor Ruth Adeyemi",
  requested_city: "Lagos", requested_size: "450", approved_by: "demo-seed",
  approved_at: daysAgo(30), created_at: daysAgo(30),
});
await insert("workspaces", { id: wsId, slug: "grace-chapel-assembly", name: "Grace Chapel HQ", city: "Lagos", organization_id: orgId, created_at: daysAgo(30) });

// Ministry units
for (const name of ["Choir", "Ushering", "Media", "Children"]) {
  await insert("ministry_units", { id: randomUUID(), workspace_id: wsId, name });
}

// People
await insert("people", { id: pastorId, full_name: "Ruth Adeyemi", gender: "female", email: "ruth@gracechapel.ng", marital_status: "married", joined_at: daysAgo(30), created_at: daysAgo(30) });
await insert("people", { id: memberAdaId, full_name: "Ada Obi", gender: "female", birthdate: "1994-06-12", email: "ada@x.com", joined_at: daysAgo(12) });
await insert("people", { id: memberSamId, full_name: "Sam Eze", gender: "male", joined_at: daysAgo(9) });
await insert("people", { id: childId, full_name: "Amara Obi", is_minor: true });
await insert("people", { id: firstTimerId, full_name: "Tunde Bakare" });

await insert("phone_contacts", { id: randomUUID(), person_id: pastorId, phone_number: "+2348001111111", status: "active", verified_at: daysAgo(30) });
await insert("phone_contacts", { id: randomUUID(), person_id: memberAdaId, phone_number: "+2348002222222", status: "active", verified_at: daysAgo(12) });
await insert("phone_contacts", { id: randomUUID(), person_id: memberSamId, phone_number: "+2348003333333", status: "active", verified_at: null });

// Memberships
await insert("branch_memberships", { id: randomUUID(), person_id: pastorId, workspace_id: wsId, role: "senior_pastor", status: "active", created_at: daysAgo(30) });
await insert("branch_memberships", { id: randomUUID(), person_id: memberAdaId, workspace_id: wsId, role: "secretary", status: "active", created_at: daysAgo(12) });
await insert("branch_memberships", { id: randomUUID(), person_id: memberSamId, workspace_id: wsId, role: "member", status: "active", created_at: daysAgo(9) });

// Child + guardianship
await insert("child_profiles", { id: randomUUID(), person_id: childId, workspace_id: wsId, allergies: "peanuts", classroom: "Little Stars (ages 4-6)" });
await insert("guardianships", { id: randomUUID(), child_person_id: childId, guardian_person_id: memberAdaId, relationship: "parent", is_primary: true, can_pickup: true, workspace_id: wsId });

// First-timer (new → awaiting follow-up)
await insert("first_timers", { id: randomUUID(), workspace_id: wsId, person_id: firstTimerId, name: "Tunde Bakare", phone: "+2348004444444", follow_up_status: "new", created_at: daysAgo(1) });

// Milestones — the timeline story
await insert("person_milestones", { id: randomUUID(), person_id: memberAdaId, workspace_id: wsId, type: "joined_membership", occurred_on: daysAgo(12), details: { via: "seed" } });
await insert("person_milestones", { id: randomUUID(), person_id: memberAdaId, workspace_id: wsId, type: "child_dedication", occurred_on: daysAgo(5), details: { via: "seed" } });
await insert("person_milestones", { id: randomUUID(), person_id: memberSamId, workspace_id: wsId, type: "baptism", occurred_on: daysAgo(3), details: {} });

// Giving — the money story
const giving = [
  { donor: "Ada Obi", amount: 25000, type: "tithe", days: 8 },
  { donor: "Sam Eze", amount: 10000, type: "offering", days: 6 },
  { donor: "Ada Obi", amount: 30000, type: "tithe", days: 4 },
  { donor: "Anonymous", amount: 5000, type: "donation", days: 2 },
  { donor: "Ruth Adeyemi", amount: 40000, type: "tithe", days: 1 },
];
for (const g of giving) {
  await insert("giving_records", {
    id: randomUUID(), workspace_id: wsId, donor_name: g.donor, amount: g.amount,
    giving_type: g.type, channel: "manual-entry", service: "giving", created_at: daysAgo(g.days),
  });
}

// Pastoral request (open — leaders should see it)
await insert("pastoral_care_requests", {
  id: randomUUID(), workspace_id: wsId, person_id: memberAdaId, requester_name: "Ada Obi",
  category: "marriage", details: "Pre-marital counselling booking", status: "open", created_at: daysAgo(1),
});

console.log("✅ Seeded: Grace Chapel Assembly — 1 church, 3 members, 1 child, 1 first-timer, 3 milestones, 5 giving records, 1 pastoral request.");
console.log("   The admin console now tells the full story.");
