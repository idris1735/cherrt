import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { buildKnowledgeContextString, demoKnowledgeArticles, type KnowledgeArticle } from "@/lib/data/knowledge";
import { slugifyWorkspaceName } from "@/lib/services/onboarding-draft";
import type { AiCommandResult } from "@/lib/types";

export type PhoneLink = {
  phoneNumber: string;
  // Nullable: WhatsApp-native links (invite-code join, no web signup) have
  // no Supabase Auth user behind them — phone number is the identity.
  // Populated only if the person separately claims web dashboard access.
  userId: string | null;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  userName: string;
  userRole: string;
};

export type WorkspaceContext = {
  pendingRequests: Array<{ id: string; title: string; amount: number | null; requester: string }>;
  recentExpenses: Array<{ title: string; amount: number }>;
  lowInventoryItems: Array<{ name: string; inStock: number; minLevel: number }>;
  pendingIssues: Array<{ title: string; severity: string }>;
};

export async function claimWhatsAppMessage(
  messageId: string | undefined,
  fromPhone: string,
  messageType: string,
): Promise<boolean> {
  if (!messageId) return true;

  const db = getSupabaseServerClient();
  if (!db) return true;

  const { error } = await db.from("whatsapp_processed_messages").insert({
    message_id: messageId,
    from_phone: fromPhone,
    message_type: messageType,
  });

  if (!error) return true;
  if (error.code === "23505") return false;

  console.error("WhatsApp idempotency check failed:", error.message);
  return true;
}

function mapPhoneLinkRow(data: {
  phone_number: string;
  user_id: string | null;
  workspace_id: string;
  workspace_slug: string;
  workspace_name: string;
  user_name: string;
  user_role: string;
}): PhoneLink {
  return {
    phoneNumber: data.phone_number,
    userId: data.user_id,
    workspaceId: data.workspace_id,
    workspaceSlug: data.workspace_slug,
    workspaceName: data.workspace_name,
    userName: data.user_name,
    userRole: data.user_role,
  };
}

// Every workspace (church/branch) this phone number is linked to. A phone
// can hold more than one link — the same person belonging to two churches
// is an explicit, supported case, not an edge case to special-case around.
export async function lookupAllPhoneLinks(phoneNumber: string): Promise<PhoneLink[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];

  const { data } = await db.from("whatsapp_phone_links").select("*").eq("phone_number", phoneNumber);
  return (data ?? []).map(mapPhoneLinkRow);
}

// Pure resolution logic, no DB access — easy to reason about and test.
// Returns the link to actually use, or null when it's genuinely ambiguous
// and the caller needs to prompt for disambiguation.
export function resolveActivePhoneLink(links: PhoneLink[], activeWorkspaceId?: string | null): PhoneLink | null {
  if (links.length === 0) return null;
  if (links.length === 1) return links[0];
  if (activeWorkspaceId) {
    const match = links.find((link) => link.workspaceId === activeWorkspaceId);
    if (match) return match;
  }
  return null;
}

// Back-compat convenience for call sites that don't need multi-church
// disambiguation (e.g. one-off lookups outside the main message flow).
// Resolves only when there's exactly one link, matching the old behavior.
export async function lookupPhoneLink(phoneNumber: string): Promise<PhoneLink | null> {
  const links = await lookupAllPhoneLinks(phoneNumber);
  return resolveActivePhoneLink(links);
}

// Insert-only link creation — used by both the WhatsApp-native invite-code
// join flow and organization/branch provisioning on approval. Never deletes
// existing links, unlike the web /api/user/whatsapp-link route (which is
// scoped to one authenticated user managing their own single link and is
// left as-is — a different identity model, not touched here).
export async function linkPhoneToWorkspace(opts: {
  phoneNumber: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  userName: string;
  userRole: string;
}): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;

  const { error } = await db.from("whatsapp_phone_links").upsert(
    {
      phone_number: opts.phoneNumber,
      workspace_id: opts.workspaceId,
      workspace_slug: opts.workspaceSlug,
      workspace_name: opts.workspaceName,
      user_name: opts.userName,
      user_role: opts.userRole,
    },
    { onConflict: "phone_number,workspace_id" },
  );

  if (error) {
    console.error("Failed to link phone to workspace:", error.message);
    return false;
  }
  return true;
}

// Small, explicit allowlist rather than a table — the group of people who
// can approve a new church signup is expected to stay tiny. Move to a table
// if that stops being true.
export function isPlatformAdmin(phoneNumber: string): boolean {
  const raw = process.env.PLATFORM_ADMIN_PHONES ?? "";
  const allowlist = raw.split(",").map((p) => p.trim()).filter(Boolean);
  return allowlist.includes(phoneNumber);
}

export function platformAdminPhones(): string[] {
  const raw = process.env.PLATFORM_ADMIN_PHONES ?? "";
  return raw.split(",").map((p) => p.trim()).filter(Boolean);
}

export async function persistWorkspaceAiResult(
  workspaceId: string,
  userName: string,
  result: AiCommandResult,
): Promise<void> {
  const db = getSupabaseServerClient();
  if (!db) return;

  const writes: PromiseLike<unknown>[] = [];

  if (result.generatedRequest) {
    writes.push(db.from("workflow_requests").upsert({
      id: result.generatedRequest.id,
      workspace_id: workspaceId,
      module_key: result.generatedRequest.module ?? "toolkit",
      request_type: result.generatedRequest.type,
      title: result.generatedRequest.title,
      description: result.generatedRequest.description,
      requester_name: result.generatedRequest.requester ?? userName,
      amount: result.generatedRequest.amount ?? null,
      status: result.generatedRequest.status ?? "pending",
    }));
  }

  if (result.generatedDocument) {
    writes.push(db.from("smart_documents").upsert({
      id: result.generatedDocument.id,
      workspace_id: workspaceId,
      title: result.generatedDocument.title,
      document_type: result.generatedDocument.type,
      body: result.generatedDocument.body,
      status: result.generatedDocument.status ?? "draft",
      prepared_by: result.generatedDocument.preparedBy ?? userName,
      awaiting_signature_from: result.generatedDocument.awaitingSignatureFrom ?? null,
      amount: result.generatedDocument.amount ?? null,
    }));
  }

  if (result.generatedExpenseEntry) {
    writes.push(db.from("toolkit_expense_entries").upsert({
      id: result.generatedExpenseEntry.id,
      workspace_id: workspaceId,
      title: result.generatedExpenseEntry.title,
      department: result.generatedExpenseEntry.department ?? "General",
      amount: result.generatedExpenseEntry.amount,
      status: result.generatedExpenseEntry.status ?? "pending",
    }));
  }

  if (result.generatedIssueReport) {
    writes.push(db.from("toolkit_issue_reports").upsert({
      id: result.generatedIssueReport.id,
      workspace_id: workspaceId,
      title: result.generatedIssueReport.title,
      area: result.generatedIssueReport.area ?? "General",
      severity: result.generatedIssueReport.severity ?? "medium",
      status: result.generatedIssueReport.status ?? "pending",
      reported_by: result.generatedIssueReport.reportedBy ?? userName,
    }));
  }

  if (result.generatedInventoryItem) {
    writes.push(db.from("toolkit_inventory_items").upsert({
      id: result.generatedInventoryItem.id,
      workspace_id: workspaceId,
      name: result.generatedInventoryItem.name,
      in_stock: result.generatedInventoryItem.inStock,
      min_level: result.generatedInventoryItem.minLevel ?? 0,
      location: result.generatedInventoryItem.location ?? "",
    }));
  }

  if (result.generatedAppointment) {
    writes.push(db.from("toolkit_appointments").upsert({
      id: result.generatedAppointment.id,
      workspace_id: workspaceId,
      title: result.generatedAppointment.title,
      when: result.generatedAppointment.when,
      owner: result.generatedAppointment.owner ?? userName,
    }));
  }

  if (result.generatedPoll) {
    writes.push(db.from("toolkit_feedback_polls").upsert({
      id: result.generatedPoll.id,
      workspace_id: workspaceId,
      title: result.generatedPoll.title,
      lane: result.generatedPoll.lane ?? "pulse",
      audience: result.generatedPoll.audience ?? "",
      owner: result.generatedPoll.owner ?? userName,
      question_count: result.generatedPoll.questionCount ?? 1,
      response_count: 0,
      target_count: result.generatedPoll.targetCount ?? 0,
      status: result.generatedPoll.status ?? "active",
    }));
  }

  if (result.generatedForm) {
    writes.push(db.from("toolkit_forms").upsert({
      id: result.generatedForm.id,
      workspace_id: workspaceId,
      name: result.generatedForm.name,
      owner: result.generatedForm.owner ?? userName,
      submissions: result.generatedForm.submissions ?? 0,
    }));
  }

  if (result.generatedPaymentLink) {
    writes.push(db.from("payment_links").upsert({
      id: result.generatedPaymentLink.id,
      workspace_id: workspaceId,
      label: result.generatedPaymentLink.label,
      amount: result.generatedPaymentLink.amount,
      status: result.generatedPaymentLink.status ?? "generated",
    }));
  }

  if (result.generatedPerson) {
    writes.push(db.from("toolkit_people").upsert({
      id: result.generatedPerson.id,
      workspace_id: workspaceId,
      name: result.generatedPerson.name,
      title: result.generatedPerson.title ?? "",
      unit: result.generatedPerson.unit ?? "",
      phone: result.generatedPerson.phone ?? "",
    }));
  }

  if (result.generatedGivingRecord) {
    writes.push(db.from("giving_records").upsert({
      id: result.generatedGivingRecord.id,
      workspace_id: workspaceId,
      donor_name: result.generatedGivingRecord.donor ?? userName,
      amount: result.generatedGivingRecord.amount,
      channel: result.generatedGivingRecord.channel ?? "virtual-transfer",
      service: result.generatedGivingRecord.service ?? "giving",
      church_name: result.generatedGivingRecord.churchName ?? null,
      virtual_account: result.generatedGivingRecord.virtualAccount ?? null,
      giving_type: result.generatedGivingRecord.givingType ?? "donation",
    }));
  }

  await Promise.allSettled(writes.map((w) => Promise.resolve(w)));
}

export type GivingSummary = {
  totalThisMonth: number;
  totalLastMonth: number;
  countThisMonth: number;
  byType: Record<string, number>;
  recent: Array<{ donor: string; amount: number; givingType: string; createdAtLabel: string }>;
};

function startOfMonth(d: Date): Date {
  const s = new Date(d);
  s.setDate(1);
  s.setHours(0, 0, 0, 0);
  return s;
}

export async function getGivingSummary(workspaceId: string): Promise<GivingSummary> {
  const empty: GivingSummary = { totalThisMonth: 0, totalLastMonth: 0, countThisMonth: 0, byType: {}, recent: [] };

  const db = getSupabaseServerClient();
  if (!db) return empty;

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = new Date(thisMonthStart);
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

  const { data, error } = await db
    .from("giving_records")
    .select("donor_name, amount, giving_type, created_at")
    .eq("workspace_id", workspaceId)
    .gte("created_at", lastMonthStart.toISOString())
    .order("created_at", { ascending: false });

  if (error || !data) return empty;

  let totalThisMonth = 0;
  let totalLastMonth = 0;
  let countThisMonth = 0;
  const byType: Record<string, number> = {};

  for (const row of data as Array<{ donor_name: string; amount: number; giving_type: string; created_at: string }>) {
    const createdAt = new Date(row.created_at);
    if (createdAt >= thisMonthStart) {
      totalThisMonth += row.amount;
      countThisMonth += 1;
      byType[row.giving_type] = (byType[row.giving_type] ?? 0) + row.amount;
    } else {
      totalLastMonth += row.amount;
    }
  }

  const recent = (data as Array<{ donor_name: string; amount: number; giving_type: string; created_at: string }>)
    .slice(0, 5)
    .map((row) => ({
      donor: row.donor_name,
      amount: row.amount,
      givingType: row.giving_type,
      createdAtLabel: new Date(row.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" }),
    }));

  return { totalThisMonth, totalLastMonth, countThisMonth, byType, recent };
}

// ─── Organizations (churches) & branches ──────────────────────────────────
//
// New organizations are human-approved (client decision, 2026-07-18 design
// doc), not self-serve. A short approval code is derived from the
// organization's own id rather than stored separately — one fewer column,
// still effectively unique for the small number of signups pending at once.

export type PendingOrganization = {
  id: string;
  code: string;
  name: string;
  requestedByPhone: string;
  requestedByName: string;
  requestedCity: string;
  requestedSize: string;
};

function codeFromOrgId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

// Shared with /api/user/whatsapp-link -- both need to produce the exact
// same phone shape Meta's webhook sends (full international, no leading
// zero, no punctuation), or a link written from one path silently never
// matches an inbound message from the other. Returns null rather than a
// best-effort guess when the input is too short to plausibly be a number.
export function normalizePhoneNumber(raw: string): string | null {
  const stripped = raw.replace(/[\s\-().+]/g, "");
  if (!stripped || stripped.length < 7 || !/^\d+$/.test(stripped)) return null;
  return stripped.startsWith("0") ? `234${stripped.slice(1)}` : stripped;
}

// Same derivation, applied to a workspace id -- a member-facing join code,
// distinct from the org-approval code above. No dedicated column needed:
// the code is always re-derivable from the id, so lookup is by scanning
// workspaces and matching the derived code (fine at this volume, same
// tradeoff as findPendingOrganizationByCode).
export function codeFromWorkspaceId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export async function findWorkspaceByJoinCode(code: string): Promise<{ id: string; slug: string; name: string } | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;

  const normalized = code.trim().toUpperCase();
  // Fetches all workspaces and matches the derived code in JS -- same
  // tradeoff as findPendingOrganizationByCode: fine at low tenant counts,
  // would need a real indexed code column if this ever needs to scale.
  const { data } = await db.from("workspaces").select("id, slug, name");
  const match = (data ?? []).find((row) => codeFromWorkspaceId(row.id) === normalized);
  return match ?? null;
}

export async function createPendingOrganization(fields: {
  name: string;
  requestedByPhone: string;
  requestedByName: string;
  requestedCity: string;
  requestedSize: string;
}): Promise<PendingOrganization | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;

  const { data, error } = await db
    .from("organizations")
    .insert({
      name: fields.name,
      status: "pending_approval",
      requested_by_phone: fields.requestedByPhone,
      requested_by_name: fields.requestedByName,
      requested_city: fields.requestedCity,
      requested_size: fields.requestedSize,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Failed to create pending organization:", error?.message);
    return null;
  }

  return { id: data.id, code: codeFromOrgId(data.id), ...fields };
}

async function findPendingOrganizationByCode(code: string): Promise<PendingOrganization | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;

  const { data } = await db
    .from("organizations")
    .select("id, name, requested_by_phone, requested_by_name, requested_city, requested_size")
    .eq("status", "pending_approval");

  const match = (data ?? []).find((row) => codeFromOrgId(row.id) === code.toUpperCase());
  if (!match) return null;

  return {
    id: match.id,
    code: codeFromOrgId(match.id),
    name: match.name,
    requestedByPhone: match.requested_by_phone ?? "",
    requestedByName: match.requested_by_name ?? "",
    requestedCity: match.requested_city ?? "",
    requestedSize: match.requested_size ?? "",
  };
}

export type ApprovedOrganization = {
  organizationId: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  requestedByPhone: string;
  requestedByName: string;
};

// Approves the organization, creates its first workspace (branch), grants
// the requester Organization Admin + Senior Pastor, and links their phone.
// No memberships row and no auth.users account — that table/RLS model is
// for web dashboard access, which is optional and decoupled (see design
// doc). Runs entirely through the service-role client.
export async function approveOrganization(code: string, approverPhone: string): Promise<ApprovedOrganization | null> {
  const pending = await findPendingOrganizationByCode(code);
  if (!pending) return null;

  const db = getSupabaseServerClient();
  if (!db) return null;

  const baseSlug = slugifyWorkspaceName(pending.name);
  let slug = baseSlug;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await db.from("workspaces").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { data: workspace, error: workspaceError } = await db
    .from("workspaces")
    .insert({
      slug,
      name: pending.name,
      legal_name: pending.name,
      city: pending.requestedCity || "Unspecified",
      timezone: "Africa/Lagos",
      organization_id: pending.id,
    })
    .select("id, slug, name")
    .single();

  if (workspaceError || !workspace) {
    console.error("Failed to create workspace for approved organization:", workspaceError?.message);
    return null;
  }

  await db.from("organizations").update({
    status: "active",
    approved_by: approverPhone,
    approved_at: new Date().toISOString(),
  }).eq("id", pending.id);

  await db.from("organization_admins").insert({
    organization_id: pending.id,
    phone_number: pending.requestedByPhone,
  });

  await linkPhoneToWorkspace({
    phoneNumber: pending.requestedByPhone,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    workspaceName: workspace.name,
    userName: pending.requestedByName,
    userRole: "owner",
  });

  return {
    organizationId: pending.id,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    workspaceName: workspace.name,
    requestedByPhone: pending.requestedByPhone,
    requestedByName: pending.requestedByName,
  };
}

export async function rejectOrganization(code: string): Promise<{ requestedByPhone: string; name: string } | false> {
  const pending = await findPendingOrganizationByCode(code);
  if (!pending) return false;

  const db = getSupabaseServerClient();
  if (!db) return false;

  const { error } = await db.from("organizations").update({ status: "rejected" }).eq("id", pending.id);
  if (error) return false;
  return { requestedByPhone: pending.requestedByPhone, name: pending.name };
}

// Returns the workspaces (branches) an organization admin can see rolled-up
// data across, distinct from the single-workspace membership every other
// role gets via whatsapp_phone_links.
export async function getOrganizationWorkspaces(phoneNumber: string): Promise<Array<{ id: string; name: string }>> {
  const db = getSupabaseServerClient();
  if (!db) return [];

  const { data: adminRows } = await db
    .from("organization_admins")
    .select("organization_id")
    .eq("phone_number", phoneNumber);

  const orgIds = (adminRows ?? []).map((row) => row.organization_id);
  if (!orgIds.length) return [];

  const { data: workspaceRows } = await db
    .from("workspaces")
    .select("id, name")
    .in("organization_id", orgIds);

  return workspaceRows ?? [];
}

export type CreatedBranch = {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
};

// Adds a branch under an already-approved organization. No platform-admin
// approval gate here — that trust decision was made once at organization
// approval time; everything under it is the org admin's own call (design
// doc, "post-approval setup"). Reuses the same slug-uniqueness pattern as
// approveOrganization's first-workspace creation.
//
// Deliberately does NOT link a branch admin phone here. Chertt cold-
// messaging someone who has never contacted the business is a real
// WhatsApp policy risk, not just a missing-template gap (2026-07-18
// onboarding audit) — so the branch admin has to message in themselves,
// same as a regular member, using the ADMIN code returned here. The org
// admin is responsible for getting that code to them by whatever channel
// they like; Chertt never initiates that contact.
export async function createBranch(opts: {
  organizationId: string;
  name: string;
  city: string;
}): Promise<CreatedBranch | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;

  const baseSlug = slugifyWorkspaceName(opts.name);
  let slug = baseSlug;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await db.from("workspaces").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { data: workspace, error } = await db
    .from("workspaces")
    .insert({
      slug,
      name: opts.name,
      legal_name: opts.name,
      city: opts.city || "Unspecified",
      timezone: "Africa/Lagos",
      organization_id: opts.organizationId,
    })
    .select("id, slug, name")
    .single();

  if (error || !workspace) {
    console.error("Failed to create branch:", error?.message);
    return null;
  }

  return { workspaceId: workspace.id, workspaceSlug: workspace.slug, workspaceName: workspace.name };
}

// Redemption side of an "ADMIN <code>" message. Guarded: only works while
// the workspace has no owner yet, so a code that leaks or gets reused after
// the branch is already set up can't be used to hijack admin access later —
// the same code that grants ownership once becomes inert after that.
export async function claimBranchAdmin(
  workspaceId: string,
  phoneNumber: string,
  userName: string,
): Promise<{ workspaceSlug: string; workspaceName: string } | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;

  const { data: existingOwner } = await db
    .from("whatsapp_phone_links")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_role", "owner")
    .maybeSingle();

  if (existingOwner) return null;

  const { data: workspace } = await db.from("workspaces").select("id, slug, name").eq("id", workspaceId).maybeSingle();
  if (!workspace) return null;

  await linkPhoneToWorkspace({
    phoneNumber,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    workspaceName: workspace.name,
    userName,
    userRole: "owner",
  });

  return { workspaceSlug: workspace.slug, workspaceName: workspace.name };
}

// Both accept a plain comma-separated string from the guided flow and
// parse it here, rather than pushing parsing logic into the conversation
// layer -- keeps onboarding-flow.ts focused on state transitions, not text
// processing.
function parseListInput(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export async function saveGivingCategories(workspaceId: string, raw: string): Promise<string[]> {
  const names = parseListInput(raw);
  if (!names.length) return [];

  const db = getSupabaseServerClient();
  if (!db) return names;

  const { error } = await db
    .from("giving_categories")
    .upsert(
      names.map((name) => ({ workspace_id: workspaceId, name })),
      { onConflict: "workspace_id,name" },
    );

  if (error) console.error("Failed to save giving categories:", error.message);
  return names;
}

export async function saveMinistryUnits(workspaceId: string, raw: string): Promise<string[]> {
  const names = parseListInput(raw);
  if (!names.length) return [];

  const db = getSupabaseServerClient();
  if (!db) return names;

  const { error } = await db
    .from("ministry_units")
    .upsert(
      names.map((name) => ({ workspace_id: workspaceId, name })),
      { onConflict: "workspace_id,name" },
    );

  if (error) console.error("Failed to save ministry units:", error.message);
  return names;
}

// Returns the owner/admin phone number for approval notifications
export async function getApproverPhone(workspaceId: string): Promise<string | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;

  const { data: members } = await db
    .from("memberships")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .in("role", ["owner", "admin"])
    .limit(1);

  if (!members?.length) return null;
  const ownerId = members[0].user_id;

  const { data: link } = await db
    .from("whatsapp_phone_links")
    .select("phone_number")
    .eq("user_id", ownerId)
    .maybeSingle();

  return link?.phone_number ?? null;
}

export async function approveWorkspaceRequest(requestId: string): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const { error } = await db.from("workflow_requests").update({ status: "approved" }).eq("id", requestId);
  return !error;
}

export async function rejectWorkspaceRequest(requestId: string): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const { error } = await db.from("workflow_requests").update({ status: "flagged" }).eq("id", requestId);
  return !error;
}

export async function loadKnowledgeContext(workspaceId: string): Promise<string> {
  const db = getSupabaseServerClient();
  if (!db) return buildKnowledgeContextString(demoKnowledgeArticles);

  const { data } = await db
    .from("toolkit_knowledge_articles")
    .select("id, type, title, body, tags")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  const articles: KnowledgeArticle[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    type: r.type as KnowledgeArticle["type"],
    title: r.title as string,
    body: r.body as string,
    tags: (r.tags as string[]) ?? [],
  }));

  // Fall back to demo KB if workspace hasn't seeded its own yet
  return buildKnowledgeContextString(articles.length ? articles : demoKnowledgeArticles);
}

export async function getWorkflowRequest(
  requestId: string,
): Promise<{ title: string; amount: number | null } | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const { data } = await db
    .from("workflow_requests")
    .select("title, amount")
    .eq("id", requestId)
    .maybeSingle();
  return data ?? null;
}

export async function loadWorkspaceContext(workspaceId: string): Promise<WorkspaceContext> {
  const db = getSupabaseServerClient();
  if (!db) return { pendingRequests: [], recentExpenses: [], lowInventoryItems: [], pendingIssues: [] };

  const [reqRes, expRes, invRes, issRes] = await Promise.allSettled([
    db.from("workflow_requests")
      .select("id, title, amount, requester_name")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),

    db.from("toolkit_expense_entries")
      .select("title, amount")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(5),

    db.from("toolkit_inventory_items")
      .select("name, in_stock, min_level")
      .eq("workspace_id", workspaceId)
      .limit(20),

    db.from("toolkit_issue_reports")
      .select("title, severity")
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "in-progress"])
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const pendingRequests =
    reqRes.status === "fulfilled" && reqRes.value.data
      ? reqRes.value.data.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          title: r.title as string,
          amount: r.amount as number | null,
          requester: r.requester_name as string,
        }))
      : [];

  const recentExpenses =
    expRes.status === "fulfilled" && expRes.value.data
      ? expRes.value.data.map((e: Record<string, unknown>) => ({
          title: e.title as string,
          amount: e.amount as number,
        }))
      : [];

  const lowInventoryItems =
    invRes.status === "fulfilled" && invRes.value.data
      ? (invRes.value.data as Array<Record<string, unknown>>)
          .filter((i) => (i.in_stock as number) <= (i.min_level as number))
          .map((i) => ({ name: i.name as string, inStock: i.in_stock as number, minLevel: i.min_level as number }))
      : [];

  const pendingIssues =
    issRes.status === "fulfilled" && issRes.value.data
      ? issRes.value.data.map((i: Record<string, unknown>) => ({
          title: i.title as string,
          severity: i.severity as string,
        }))
      : [];

  return { pendingRequests, recentExpenses, lowInventoryItems, pendingIssues };
}
