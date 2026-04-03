import type { ModuleKey, Role } from "@/lib/types";

export type CommandRequestContext = {
  role?: Role;
  enabledModules?: ModuleKey[];
};

export type CommandRequestPayload = {
  prompt: string;
  context?: CommandRequestContext;
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

  return {
    ok: true,
    data: {
      prompt,
      context: Object.keys(context).length ? context : undefined,
    },
  };
}
