import type { Workspace } from "@/lib/types";

export type WorkspaceProfileSettings = {
  name: string;
  legalName: string;
  city: string;
  timezone: string;
  logoDataUrl?: string;
  accent: string;
};

export type WorkspaceMemberSettings = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string;
};

function profileKey(workspaceId: string) {
  return `chertt:workspace-profile:${workspaceId}`;
}

function membersKey(workspaceId: string) {
  return `chertt:workspace-members:${workspaceId}`;
}

export function defaultWorkspaceProfile(workspace: Workspace): WorkspaceProfileSettings {
  return {
    name: workspace.name,
    legalName: workspace.legalName,
    city: workspace.city,
    timezone: workspace.timezone,
    accent: workspace.brand.accent,
  };
}

export function loadWorkspaceProfileSettings(workspace: Workspace): WorkspaceProfileSettings {
  if (typeof window === "undefined") return defaultWorkspaceProfile(workspace);
  try {
    const raw = window.localStorage.getItem(profileKey(workspace.id));
    return { ...defaultWorkspaceProfile(workspace), ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return defaultWorkspaceProfile(workspace);
  }
}

export function saveWorkspaceProfileSettings(workspaceId: string, settings: WorkspaceProfileSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(profileKey(workspaceId), JSON.stringify(settings));
}

export function loadWorkspaceMemberSettings(workspaceId: string): WorkspaceMemberSettings[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(membersKey(workspaceId));
    return raw ? (JSON.parse(raw) as WorkspaceMemberSettings[]) : [];
  } catch {
    return [];
  }
}

export function saveWorkspaceMemberSettings(workspaceId: string, members: WorkspaceMemberSettings[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(membersKey(workspaceId), JSON.stringify(members));
}
