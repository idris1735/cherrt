import { getSupabaseServerClient } from "@/lib/services/supabase-server";

export type WhatsAppSession = {
  phoneNumber: string;
  welcomed: boolean;
  demoBalance: number;
  userName?: string;
  // Which workspace this conversation is currently scoped to, when the phone
  // is linked to more than one (multi-church membership). Null/undefined
  // means either "only one link, no ambiguity" or "not yet resolved."
  activeWorkspaceId?: string;
  // In-progress guided flow (e.g. new church signup, post-approval setup) —
  // deterministic step-by-step state, separate from the free-form Gemini
  // artifact path. Discriminated union so the two flows can have
  // independent step vocabularies and collected shapes.
  onboarding?:
    | {
        flow: "new-church-signup";
        step: "name" | "admin_name" | "admin_role" | "city" | "size" | "confirm";
        collected: {
          name?: string;
          adminName?: string;
          adminRole?: string;
          city?: string;
          size?: string;
        };
      }
    | {
        flow: "post-approval-setup";
        step: "giving_categories" | "ministry_units" | "ask_branch" | "branch_name" | "branch_city" | "branch_more" | "done";
        collected: {
          organizationId: string;
          workspaceId: string;
          givingCategories?: string[];
          ministryUnits?: string[];
          // Chertt never contacts a branch admin directly (2026-07-18
          // policy decision) -- just tracks what was created, for the
          // final summary. No phone here; the ADMIN code is how ownership
          // actually gets claimed, by the branch admin messaging in.
          branches: Array<{ name: string; city: string; workspaceId: string }>;
          branchDraft?: { name?: string };
        };
      };
  pendingConfirmation?: {
    originalPrompt: string;
    artifactKind: string;
    previewTitle: string;
  };
  pendingApproval?: {
    requestId: string;
    requestTitle: string;
    requesterPhone?: string;
  };
  history: Array<{ role: "user" | "assistant"; text: string }>;
  // In-memory only — not persisted to DB. Resets on cold start (acceptable).
  clarificationStreak?: number;
  activePoll?: {
    id: string;
    title: string;
    options: string[];
    votes: Record<string, number>;
  };
};

type DbRow = {
  phone_number: string;
  welcomed: boolean;
  demo_balance: number;
  user_name: string | null;
  active_workspace_id: string | null;
  onboarding: WhatsAppSession["onboarding"] | null;
  pending_confirmation: WhatsAppSession["pendingConfirmation"] | null;
  pending_approval: WhatsAppSession["pendingApproval"] | null;
  history: WhatsAppSession["history"];
  updated_at?: string;
};

const MAX_HISTORY_ENTRIES = 20;
const DEMO_STARTING_BALANCE = 500_000;

const sessions = new Map<string, WhatsAppSession>();

function getDb() {
  return getSupabaseServerClient();
}

function toSession(row: DbRow): WhatsAppSession {
  return {
    phoneNumber: row.phone_number,
    welcomed: row.welcomed,
    demoBalance: row.demo_balance,
    userName: row.user_name ?? undefined,
    activeWorkspaceId: row.active_workspace_id ?? undefined,
    onboarding: row.onboarding ?? undefined,
    pendingConfirmation: row.pending_confirmation ?? undefined,
    pendingApproval: row.pending_approval ?? undefined,
    history: row.history ?? [],
  };
}

function toDbRow(session: WhatsAppSession): DbRow {
  return {
    phone_number: session.phoneNumber,
    welcomed: session.welcomed,
    demo_balance: session.demoBalance,
    user_name: session.userName ?? null,
    active_workspace_id: session.activeWorkspaceId ?? null,
    onboarding: session.onboarding ?? null,
    pending_confirmation: session.pendingConfirmation ?? null,
    pending_approval: session.pendingApproval ?? null,
    history: session.history,
    updated_at: new Date().toISOString(),
  };
}

async function persistSession(session: WhatsAppSession): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from("whatsapp_sessions").upsert(toDbRow(session));
}

async function loadSessionFromDb(phoneNumber: string): Promise<WhatsAppSession | null> {
  const db = getDb();
  if (db) {
    const { data } = await db
      .from("whatsapp_sessions")
      .select()
      .eq("phone_number", phoneNumber)
      .maybeSingle();

    if (data) {
      return toSession(data as DbRow);
    }
  }

  return null;
}

async function ensureSession(phoneNumber: string): Promise<WhatsAppSession> {
  const cached = sessions.get(phoneNumber);
  if (cached) return cached;

  const existing = await loadSessionFromDb(phoneNumber);
  if (existing) {
    sessions.set(phoneNumber, existing);
    return existing;
  }

  const session: WhatsAppSession = {
    phoneNumber,
    welcomed: false,
    demoBalance: DEMO_STARTING_BALANCE,
    history: [],
  };
  sessions.set(phoneNumber, session);
  await persistSession(session);
  return session;
}

export async function getSession(phoneNumber: string): Promise<WhatsAppSession> {
  return ensureSession(phoneNumber);
}

export async function updateSession(phoneNumber: string, updates: Partial<Omit<WhatsAppSession, "phoneNumber">>): Promise<void> {
  const existing = await ensureSession(phoneNumber);
  const next = { ...existing, ...updates };
  sessions.set(phoneNumber, next);
  await persistSession(next);
}

export async function addToHistory(phoneNumber: string, role: "user" | "assistant", text: string): Promise<void> {
  const existing = await ensureSession(phoneNumber);
  const history = [...existing.history, { role, text }].slice(-MAX_HISTORY_ENTRIES);
  const next = { ...existing, history };
  sessions.set(phoneNumber, next);
  await persistSession(next);
}

export async function clearPending(phoneNumber: string): Promise<void> {
  const session = await ensureSession(phoneNumber);
  const next = { ...session, pendingConfirmation: undefined, pendingApproval: undefined };
  sessions.set(phoneNumber, next);
  await persistSession(next);
}

export async function deductDemoBalance(phoneNumber: string, amount: number): Promise<void> {
  const session = await ensureSession(phoneNumber);
  const next = { ...session, demoBalance: Math.max(0, session.demoBalance - amount) };
  sessions.set(phoneNumber, next);
  await persistSession(next);
}

export function resetSessions(): void {
  sessions.clear();
}
