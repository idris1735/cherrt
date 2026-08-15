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
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*?)\r?$/);
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

// FK-safe order: conversation memory + logs → runtime data → memberships →
// identity → orgs. Tables that don't exist yet just 404 and are skipped.
const TABLES = [
  // Conversation memory + delivery logs — clears so the bot feels brand-new to everyone.
  "conversations", "messages",
  "whatsapp_sessions", "whatsapp_processed_messages", "whatsapp_send_logs", "otp_challenges",
  "whatsapp_phone_links", // legacy phone→workspace links — MUST go or the bot resolves stale links
  // AI-collected + governed data.
  "chat_attachments", "person_attributes", "flagged_messages", "data_requests",
  "kyc_applications",
  "giving_records", "giving_categories", "prayer_requests", "first_timers", "pastoral_care_requests",
  "child_checkins", "event_registrations", "event_records", "department_memberships",
  "life_journeys", "announcements", "pastoral_form_submissions", "person_milestones",
  "guardianships", "child_profiles", "branch_memberships", "organization_admins",
  "phone_contacts", "people", "workspaces", "organizations", "ministry_units",
  // Legacy web toolkit + workflow tables.
  "memberships", "workflow_requests", "smart_documents",
  "toolkit_expense_entries", "toolkit_issue_reports", "toolkit_inventory_items",
  "toolkit_forms", "toolkit_feedback_polls", "toolkit_people", "toolkit_appointments",
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
  // PostgREST DELETE needs a filter; try `id`, then `created_at`, then give up.
  // Resilient: a missing table (404), missing column, or odd shape just gets
  // skipped with a warning — one odd table never aborts the whole reset.
  const filters = ["id=not.is.null", "created_at=not.is.null", "id=neq.00000000-0000-0000-0000-000000000000"];
  for (const f of filters) {
    try {
      const res = await rest(`${table}?${f}`, "DELETE");
      if (res.ok) return;
      const body = await res.text();
      // A filter that doesn't parse (PGRST100) or an unknown column — try next.
      if (res.status === 400 && body.includes("PGRST")) continue;
      throw new Error(`${res.status}: ${body}`);
    } catch (err) {
      if (String(err.message).includes("column") || String(err.message).includes("PGRST100")) continue;
      console.warn(`   ⚠ skipped ${table}: ${String(err.message).split("\n")[0]}`);
      return;
    }
  }
}

async function emptyBucket(bucket) {
  // List and remove all objects in a private storage bucket. Empty buckets and
  // buckets that don't exist just resolve to nothing — never fatal.
  const list = await rest(`storage/v1/object/list/${bucket}`, "POST", { prefix: "" });
  const parsed = await list.json().catch(() => null);
  const items = Array.isArray(parsed) ? parsed : [];
  for (const obj of items) {
    await rest(`storage/v1/object/${bucket}/${encodeURIComponent(obj.name)}`, "DELETE");
  }
}

let deleted = 0;
console.log("🧹 Resetting Chertt demo data…");
for (let pass = 0; pass < 2; pass++) {
  for (const table of TABLES) {
    try {
      await wipeTable(table);
      deleted += 1;
    } catch (err) {
      if (pass === 1) console.warn(`  ⚠️ ${table}: ${err.message}`);
    }
  }
}
for (const bucket of ["kyc", "chat-attachments"]) {
  try {
    await emptyBucket(bucket);
    console.log(`  📁 ${bucket} bucket emptied`);
  } catch (err) {
    console.warn(`  ⚠️ ${bucket} bucket: ${err.message}`);
  }
}
console.log(`✅ Done — clean slate. WhatsApp sessions, people, churches, KYC all cleared.`);
