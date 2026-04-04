"use client";

import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import type { ModuleKey } from "@/lib/types";

const ONBOARDING_DRAFT_KEY = "chertt:onboarding-draft";
const LAST_WORKSPACE_KEY = "chertt:last-workspace-slug";

export type OnboardingDraft = {
  selectedModule: ModuleKey;
  fields: Record<string, string>;
  choices: Record<string, string[]>;
  savedAt: string;
};

export type BootstrapResult =
  | { status: "ready"; slug: string; selectedModule: ModuleKey }
  | { status: "auth-required" | "missing-draft" | "unavailable"; message?: string }
  | { status: "error"; message: string };

function canUseStorage() {
  return typeof window !== "undefined";
}

export function saveOnboardingDraft(draft: OnboardingDraft) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
}

export function getOnboardingDraft() {
  if (!canUseStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(ONBOARDING_DRAFT_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as OnboardingDraft;
    if (!parsed?.selectedModule || !parsed?.fields) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearOnboardingDraft() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(ONBOARDING_DRAFT_KEY);
}

export function getLastWorkspaceSlug() {
  if (!canUseStorage()) {
    return null;
  }

  return window.localStorage.getItem(LAST_WORKSPACE_KEY);
}

export function rememberLastWorkspaceSlug(slug: string) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(LAST_WORKSPACE_KEY, slug);
}

export function clearLastWorkspaceSlug() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(LAST_WORKSPACE_KEY);
}

export function slugifyWorkspaceName(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "workspace";
}

export async function bootstrapWorkspaceFromDraft(): Promise<BootstrapResult> {
  const draft = getOnboardingDraft();
  if (!draft) {
    return { status: "missing-draft" };
  }

  const supabase = getSupabaseBrowserClient() as any;
  if (!supabase) {
    return { status: "unavailable", message: "Supabase is not configured yet." };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: "auth-required" };
  }

  const workspaceName = draft.fields.orgName?.trim() || "Chertt Workspace";
  const workspaceSlug = slugifyWorkspaceName(workspaceName);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos";

  const { error } = await supabase.rpc("bootstrap_workspace", {
    p_slug: workspaceSlug,
    p_name: workspaceName,
    p_legal_name: draft.fields.orgName?.trim() || workspaceName,
    p_city: draft.fields.location?.trim() || "Not specified",
    p_timezone: timezone,
    p_email: user.email || draft.fields.email?.trim() || "",
    p_role: "owner",
    p_title: draft.fields.role?.trim() || "Workspace Lead",
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  rememberLastWorkspaceSlug(workspaceSlug);
  clearOnboardingDraft();

  return {
    status: "ready",
    slug: workspaceSlug,
    selectedModule: draft.selectedModule,
  };
}
