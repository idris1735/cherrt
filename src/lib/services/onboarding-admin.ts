import { getSupabaseBrowserClient } from "@/lib/services/supabase";

export type OnboardingStatus = "not-started" | "in-progress" | "completed";

export type OnboardingTrack = {
  id: string;
  personId?: string;
  staffName: string;
  roleTitle: string;
  ownerName: string;
  dueLabel: string;
  status: OnboardingStatus;
  completedSteps: string[];
  notes: string;
  updatedAt: string;
};

export type OnboardingTrackInput = {
  personId?: string;
  staffName: string;
  roleTitle: string;
  ownerName: string;
  dueLabel: string;
};

type OnboardingTrackRow = {
  id: string;
  person_id: string | null;
  staff_name: string;
  role_title: string;
  owner_name: string;
  due_label: string;
  status: OnboardingStatus;
  completed_steps: string[] | null;
  notes: string | null;
  updated_at: string;
};

function isUuid(value: string | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value));
}

function localKey(workspaceId: string) {
  return `chertt:onboarding:${workspaceId}`;
}

function readLocal(workspaceId: string): OnboardingTrack[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localKey(workspaceId));
    return raw ? (JSON.parse(raw) as OnboardingTrack[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(workspaceId: string, tracks: OnboardingTrack[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localKey(workspaceId), JSON.stringify(tracks));
}

function mapRow(row: OnboardingTrackRow): OnboardingTrack {
  return {
    id: row.id,
    personId: row.person_id ?? undefined,
    staffName: row.staff_name,
    roleTitle: row.role_title,
    ownerName: row.owner_name,
    dueLabel: row.due_label,
    status: row.status,
    completedSteps: row.completed_steps ?? [],
    notes: row.notes ?? "",
    updatedAt: row.updated_at,
  };
}

export function resolveOnboardingStatus(completedSteps: string[], stepCount: number): OnboardingStatus {
  if (completedSteps.length >= stepCount && stepCount > 0) return "completed";
  if (completedSteps.length > 0) return "in-progress";
  return "not-started";
}

export async function loadOnboardingTracks(workspaceId: string): Promise<OnboardingTrack[]> {
  if (!isUuid(workspaceId)) return readLocal(workspaceId);

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return readLocal(workspaceId);

  const { data, error } = await (supabase as any)
    .from("toolkit_onboarding_tracks")
    .select("id, person_id, staff_name, role_title, owner_name, due_label, status, completed_steps, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (error) return readLocal(workspaceId);
  return (data as OnboardingTrackRow[]).map(mapRow);
}

export async function createOnboardingTrack(
  workspaceId: string,
  input: OnboardingTrackInput,
): Promise<OnboardingTrack | null> {
  const localTrack: OnboardingTrack = {
    id: `local-${crypto.randomUUID()}`,
    ...input,
    status: "not-started",
    completedSteps: [],
    notes: "",
    updatedAt: new Date().toISOString(),
  };

  if (!isUuid(workspaceId)) {
    writeLocal(workspaceId, [localTrack, ...readLocal(workspaceId)]);
    return localTrack;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    writeLocal(workspaceId, [localTrack, ...readLocal(workspaceId)]);
    return localTrack;
  }

  const { data, error } = await (supabase as any)
    .from("toolkit_onboarding_tracks")
    .insert({
      workspace_id: workspaceId,
      person_id: isUuid(input.personId) ? input.personId : null,
      staff_name: input.staffName,
      role_title: input.roleTitle,
      owner_name: input.ownerName,
      due_label: input.dueLabel,
      status: "not-started",
      completed_steps: [],
    })
    .select("id, person_id, staff_name, role_title, owner_name, due_label, status, completed_steps, updated_at")
    .single();

  if (error || !data) return null;
  return mapRow(data as OnboardingTrackRow);
}

export async function updateOnboardingTrackSteps(
  workspaceId: string,
  trackId: string,
  completedSteps: string[],
  stepCount: number,
): Promise<OnboardingTrack | null> {
  const status = resolveOnboardingStatus(completedSteps, stepCount);
  const updatedAt = new Date().toISOString();

  if (!isUuid(workspaceId) || !isUuid(trackId)) {
    let updated: OnboardingTrack | null = null;
    const next = readLocal(workspaceId).map((track) => {
      if (track.id !== trackId) return track;
      updated = { ...track, completedSteps, status, updatedAt };
      return updated;
    });
    writeLocal(workspaceId, next);
    return updated;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await (supabase as any)
    .from("toolkit_onboarding_tracks")
    .update({ completed_steps: completedSteps, status, updated_at: updatedAt })
    .eq("id", trackId)
    .eq("workspace_id", workspaceId)
    .select("id, person_id, staff_name, role_title, owner_name, due_label, status, completed_steps, updated_at")
    .single();

  if (error || !data) return null;
  return mapRow(data as OnboardingTrackRow);
}

export async function deleteOnboardingTrack(workspaceId: string, trackId: string): Promise<boolean> {
  if (!isUuid(workspaceId) || !isUuid(trackId)) {
    writeLocal(workspaceId, readLocal(workspaceId).filter((track) => track.id !== trackId));
    return true;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;
  const { error } = await (supabase as any)
    .from("toolkit_onboarding_tracks")
    .delete()
    .eq("id", trackId)
    .eq("workspace_id", workspaceId);

  return !error;
}

export async function updateOnboardingNotes(
  workspaceId: string,
  trackId: string,
  notes: string,
): Promise<boolean> {
  if (!isUuid(workspaceId) || !isUuid(trackId)) {
    const next = readLocal(workspaceId).map((track) =>
      track.id === trackId ? { ...track, notes } : track,
    );
    writeLocal(workspaceId, next);
    return true;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;
  const { error } = await (supabase as any)
    .from("toolkit_onboarding_tracks")
    .update({ notes })
    .eq("id", trackId)
    .eq("workspace_id", workspaceId);

  return !error;
}
