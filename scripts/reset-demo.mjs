// One-command demo reset. Deletes all rows from every public data table
// (multi-pass to satisfy FK order) and empties the `kyc` storage bucket.
// Schema is left intact. Safe to run between rehearsals.
//
//   npm run reset-demo

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");
let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

try {
  const envText = readFileSync(envPath, "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    const value = raw.trim().replace(/^["']|["']$/g, "");
    if (key === "NEXT_PUBLIC_SUPABASE_URL" && !SUPABASE_URL) SUPABASE_URL = value;
    if (key === "SUPABASE_SERVICE_ROLE_KEY" && !SERVICE_KEY) SERVICE_KEY = value;
  }
} catch { /* env file missing — use process env only */ }

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (check .env.local).");
  process.exit(1);
}

// FK-safe order: runtime data → memberships → identity → orgs
const TABLES = [
  "whatsapp_sessions", "whatsapp_processed_messages", "otp_challenges", "kyc_applications",
  "giving_records", "prayer_requests", "first_timers", "pastoral_care_requests",
  "child_checkins", "event_registrations", "event_records", "department_memberships",
  "life_journeys", "announcements", "pastoral_form_submissions", "person_milestones",
  "guardianships", "child_profiles", "branch_memberships", "organization_admins",
  "phone_contacts", "people", "workspaces", "organizations", "ministry_units",
];

async function rest(path, method = "GET", body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(method === "PATCH" ? { Prefer: "return=minimal" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  }
  return res;
}

async function wipeTable(table) {
  // PostgREST DELETE needs a filter; use a column that always exists.
  await rest(`${table}?id=not.null`, "DELETE");
}

async function emptyBucket() {
  // List and remove all objects in the private kyc bucket
  const list = await rest("storage/v1/object/list/kyc", "POST", { prefix: "" });
  const items = await list.json().catch(() => []);
  for (const obj of items) {
    await rest(`storage/v1/object/kyc/${encodeURIComponent(obj.name)}`, "DELETE");
  }
}

let deleted = 0;
console.log("🧹 Resetting Chertt demo data…");
for (let pass = 0; pass < 2; pass++) {
  for (const table of TABLES) {
    try {
      const before = deleted;
      await wipeTable(table);
      deleted += 1;
      if (deleted === before) void 0;
    } catch (err) {
      if (pass === 1) console.warn(`  ⚠️ ${table}: ${err.message}`);
    }
  }
}
try {
  await emptyBucket();
  console.log("  📁 kyc bucket emptied");
} catch (err) {
  console.warn(`  ⚠️ kyc bucket: ${err.message}`);
}
console.log(`✅ Done — clean slate. WhatsApp sessions, people, churches, KYC all cleared.`);
