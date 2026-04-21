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

const MAX_HISTORY_ENTRIES = 20;
const DEMO_STARTING_BALANCE = 500_000;

const sessions = new Map<string, WhatsAppSession>();

export function getSession(phoneNumber: string): WhatsAppSession {
  if (!sessions.has(phoneNumber)) {
    sessions.set(phoneNumber, {
      phoneNumber,
      welcomed: false,
      demoBalance: DEMO_STARTING_BALANCE,
      history: [],
    });
  }
  return sessions.get(phoneNumber)!;
}

export function updateSession(phoneNumber: string, updates: Partial<Omit<WhatsAppSession, "phoneNumber">>): void {
  const session = getSession(phoneNumber);
  sessions.set(phoneNumber, { ...session, ...updates });
}

export function addToHistory(phoneNumber: string, role: "user" | "assistant", text: string): void {
  const session = getSession(phoneNumber);
  const history = [...session.history, { role, text }].slice(-MAX_HISTORY_ENTRIES);
  sessions.set(phoneNumber, { ...session, history });
}

export function clearPending(phoneNumber: string): void {
  const session = getSession(phoneNumber);
  sessions.set(phoneNumber, {
    ...session,
    pendingConfirmation: undefined,
    pendingApproval: undefined,
  });
}

export function deductDemoBalance(phoneNumber: string, amount: number): void {
  const session = getSession(phoneNumber);
  const next = Math.max(0, session.demoBalance - amount);
  sessions.set(phoneNumber, { ...session, demoBalance: next });
}

export function resetSessions(): void {
  sessions.clear();
}
