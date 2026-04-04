import type { ModuleKey, Role } from "@/lib/types";

export type CommandRequestContext = {
  role?: Role;
  enabledModules?: ModuleKey[];
  userName?: string;
  userTitle?: string;
  userOrganization?: string;
};

export type HistoryMessage = { speaker: string; text: string };

export type CommandRequestPayload = {
  prompt: string;
  context?: CommandRequestContext;
  confirmed?: boolean;
  history?: HistoryMessage[];
  memoryContext?: string;
};

const roleSet = new Set<Role>([
  "owner",
  "admin",
  "approver",
  "finance",
  "operations",
  "pastoral",
  "store-manager",
  "event-manager",
]);

const moduleSet = new Set<ModuleKey>(["toolkit", "church", "store", "events"]);
const MAX_PROMPT_LENGTH = 6000;

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizePrompt(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const prompt = value.trim();
  if (!prompt) {
    return null;
  }
  return prompt.slice(0, MAX_PROMPT_LENGTH);
}

function normalizeContext(value: unknown): CommandRequestContext | null {
  if (value === undefined) {
    return {};
  }

  const objectValue = asObject(value);
  if (!objectValue) {
    return null;
  }

  const context: CommandRequestContext = {};

  if (objectValue.role !== undefined) {
    if (typeof objectValue.role !== "string" || !roleSet.has(objectValue.role as Role)) {
      return null;
    }
    context.role = objectValue.role as Role;
  }

  if (typeof objectValue.userName === "string" && objectValue.userName.trim()) {
    context.userName = objectValue.userName.trim().slice(0, 120);
  }

  if (typeof objectValue.userTitle === "string" && objectValue.userTitle.trim()) {
    context.userTitle = objectValue.userTitle.trim().slice(0, 120);
  }

  if (typeof objectValue.userOrganization === "string" && objectValue.userOrganization.trim()) {
    context.userOrganization = objectValue.userOrganization.trim().slice(0, 120);
  }

  if (objectValue.enabledModules !== undefined) {
    if (!Array.isArray(objectValue.enabledModules)) {
      return null;
    }

    const modules: ModuleKey[] = [];
    for (const moduleEntry of objectValue.enabledModules) {
      if (typeof moduleEntry !== "string" || !moduleSet.has(moduleEntry as ModuleKey)) {
        return null;
      }
      if (!modules.includes(moduleEntry as ModuleKey)) {
        modules.push(moduleEntry as ModuleKey);
      }
    }

    context.enabledModules = modules;
  }

  return context;
}

export function parseCommandRequestPayload(input: unknown):
  | { ok: true; data: CommandRequestPayload }
  | { ok: false; error: string } {
  const payload = asObject(input);
  if (!payload) {
    return { ok: false, error: "Invalid request body." };
  }

  const prompt = normalizePrompt(payload.prompt);
  if (!prompt) {
    return { ok: false, error: "Prompt is required." };
  }

  const context = normalizeContext(payload.context);
  if (context === null) {
    return { ok: false, error: "Invalid command context." };
  }

  const confirmed = payload.confirmed === true;

  // history: array of {speaker, text}, max 20 entries, strings only
  let history: HistoryMessage[] | undefined;
  if (Array.isArray(payload.history)) {
    history = (payload.history as unknown[])
      .filter((m): m is HistoryMessage => {
        if (typeof m !== "object" || m === null) return false;
        const msg = m as Record<string, unknown>;
        return typeof msg.speaker === "string" && typeof msg.text === "string";
      })
      .slice(-20);
  }

  const memoryContext =
    typeof payload.memoryContext === "string" ? payload.memoryContext.slice(0, 4000) : undefined;

  return {
    ok: true,
    data: {
      prompt,
      context: Object.keys(context).length ? context : undefined,
      confirmed,
      history,
      memoryContext,
    },
  };
}
