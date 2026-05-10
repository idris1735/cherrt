import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import type { Person } from "@/lib/types";

export type PersonInput = Omit<Person, "id">;

type PersonRow = {
  id: string;
  name: string;
  title: string;
  unit: string;
  phone: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function localKey(workspaceId: string) {
  return `chertt:directory:${workspaceId}`;
}

function mapRow(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    unit: row.unit,
    phone: row.phone,
  };
}

function readLocal(workspaceId: string): Person[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localKey(workspaceId));
    return raw ? (JSON.parse(raw) as Person[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(workspaceId: string, people: Person[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localKey(workspaceId), JSON.stringify(people));
}

export function mergeDirectoryPeople(seed: Person[], saved: Person[]) {
  const byId = new Map<string, Person>();
  for (const person of seed) byId.set(person.id, person);
  for (const person of saved) byId.set(person.id, person);
  return [...byId.values()];
}

export async function loadDirectoryPeople(workspaceId: string, seed: Person[]): Promise<Person[]> {
  if (!isUuid(workspaceId)) return mergeDirectoryPeople(seed, readLocal(workspaceId));

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return mergeDirectoryPeople(seed, readLocal(workspaceId));

  const { data, error } = await (supabase as any)
    .from("toolkit_people")
    .select("id, name, title, unit, phone")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (error) return mergeDirectoryPeople(seed, readLocal(workspaceId));
  return (data as PersonRow[]).map(mapRow);
}

export async function createDirectoryPerson(workspaceId: string, input: PersonInput): Promise<Person | null> {
  const localPerson: Person = { id: `local-${crypto.randomUUID()}`, ...input };
  if (!isUuid(workspaceId)) {
    writeLocal(workspaceId, [localPerson, ...readLocal(workspaceId)]);
    return localPerson;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    writeLocal(workspaceId, [localPerson, ...readLocal(workspaceId)]);
    return localPerson;
  }

  const { data, error } = await (supabase as any)
    .from("toolkit_people")
    .insert({ workspace_id: workspaceId, ...input })
    .select("id, name, title, unit, phone")
    .single();

  if (error || !data) return null;
  return mapRow(data as PersonRow);
}

export async function updateDirectoryPerson(workspaceId: string, personId: string, input: PersonInput): Promise<Person | null> {
  if (!isUuid(workspaceId) || !isUuid(personId)) {
    const saved = readLocal(workspaceId);
    const found = saved.some((person) => person.id === personId);
    const updated = { id: personId, ...input };
    const next = found ? saved.map((person) => (person.id === personId ? updated : person)) : [updated, ...saved];
    writeLocal(workspaceId, next);
    return updated;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await (supabase as any)
    .from("toolkit_people")
    .update(input)
    .eq("id", personId)
    .eq("workspace_id", workspaceId)
    .select("id, name, title, unit, phone")
    .single();

  if (error || !data) return null;
  return mapRow(data as PersonRow);
}

export async function deleteDirectoryPerson(workspaceId: string, personId: string): Promise<boolean> {
  if (!isUuid(workspaceId) || !isUuid(personId)) {
    writeLocal(workspaceId, readLocal(workspaceId).filter((person) => person.id !== personId));
    return true;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;
  const { error } = await (supabase as any)
    .from("toolkit_people")
    .delete()
    .eq("id", personId)
    .eq("workspace_id", workspaceId);

  return !error;
}
