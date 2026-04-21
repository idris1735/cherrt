import { createClient } from "@supabase/supabase-js";

export type WhatsAppSession = {
  phoneNumber: string;
  welcomed: boolean;
  demoBalance: number;
  userName?: string;
  pendingConfirmation?: {
    originalPrompt: string;
    artifactKind: string;
    previewTitle: string;
  };
  pendingApproval?: {
    requestId: string;
    requestTitle: string;
  };
  history: Array<{ role: "user" | "assistant"; text: string }>;
};

type DbRow = {
  phone_number: string;
  welcomed: boolean;
  demo_balance: number;
  user_name: string | null;
  pending_confirmation: WhatsAppSession["pendingConfirmation"] | null;
  pending_approval: WhatsAppSession["pendingApproval"] | null;
  history: WhatsAppSession["history"];
};

const MAX_HISTORY_ENTRIES = 20;
const DEMO_STARTING_BALANCE = 500_000;

const sessions = new Map<string, WhatsAppSession>();

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function toSession(row: DbRow): WhatsAppSession {
  return {
    phoneNumber: row.phone_number,
    welcomed: row.welcomed,
    demoBalance: row.demo_balance,
    userName: row.user_name ?? undefined,
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
    pending_confirmation: session.pendingConfirmation ?? null,
    pending_approval: session.pendingApproval ?? null,
    history: session.history,
  };
}

async function persistSession(session: WhatsAppSession): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from("whatsapp_sessions").upsert(toDbRow(session));
}

export async function getSession(phoneNumber: string): Promise<WhatsAppSession> {
  if (sessions.has(phoneNumber)) {
    return sessions.get(phoneNumber)!;
  }

  const db = getDb();
  if (db) {
    const { data } = await db
      .from("whatsapp_sessions")
      .select()
      .eq("phone_number", phoneNumber)
      .maybeSingle();

    if (data) {
      const session = toSession(data as DbRow);
      sessions.set(phoneNumber, session);
      return session;
    }
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

export async function updateSession(phoneNumber: string, updates: Partial<Omit<WhatsAppSession, "phoneNumber">>): Promise<void> {
  const existing = sessions.get(phoneNumber) ?? {
    phoneNumber,
    welcomed: false,
    demoBalance: DEMO_STARTING_BALANCE,
    history: [],
  };
  const next = { ...existing, ...updates };
  sessions.set(phoneNumber, next);
  await persistSession(next);
}

export async function addToHistory(phoneNumber: string, role: "user" | "assistant", text: string): Promise<void> {
  const existing = sessions.get(phoneNumber) ?? {
    phoneNumber,
    welcomed: false,
    demoBalance: DEMO_STARTING_BALANCE,
    history: [],
  };
  const history = [...existing.history, { role, text }].slice(-MAX_HISTORY_ENTRIES);
  const next = { ...existing, history };
  sessions.set(phoneNumber, next);
  await persistSession(next);
}

export async function clearPending(phoneNumber: string): Promise<void> {
  const session = sessions.get(phoneNumber);
  if (!session) return;
  const next = { ...session, pendingConfirmation: undefined, pendingApproval: undefined };
  sessions.set(phoneNumber, next);
  await persistSession(next);
}

export async function deductDemoBalance(phoneNumber: string, amount: number): Promise<void> {
  const session = sessions.get(phoneNumber);
  if (!session) return;
  const next = { ...session, demoBalance: Math.max(0, session.demoBalance - amount) };
  sessions.set(phoneNumber, next);
  await persistSession(next);
}

export function resetSessions(): void {
  sessions.clear();
}
