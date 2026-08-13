import { describe, it, expect, vi, beforeEach } from "vitest";

const { peopleRows, contactsRows, membershipsRows, workspacesRows, orgsRows } = vi.hoisted(() => ({
  peopleRows: [] as Record<string, unknown>[],
  contactsRows: [] as Record<string, unknown>[],
  membershipsRows: [] as Record<string, unknown>[],
  workspacesRows: [] as Record<string, unknown>[],
  orgsRows: [] as Record<string, unknown>[],
}));

function builder(rows: unknown[], tableName: string) {
  let filtered = [...rows];
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (k: string, v: unknown) => { filtered = filtered.filter((r: any) => r[k] === v); return api; },
    in: (k: string, vs: unknown[]) => { filtered = filtered.filter((r: any) => (vs as unknown[]).includes(r[k])); return api; },
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null }),
    insert: (row: any) => {
      const id = `new-${tableName}-${rows.length + 1}`;
      const created = { ...row, id };
      rows.push(created);
      return { select: () => ({ single: () => Promise.resolve({ data: created }) }) };
    },
    update: (patch: any) => {
      for (const r of rows as any[]) {
        if (filtered.includes(r)) Object.assign(r, patch);
      }
      return { eq: () => Promise.resolve({ error: null }) };
    },
    then: (res: (v: { data: unknown[] }) => void) => res({ data: filtered }),
  };
  return api;
}

vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (t: string) => {
      if (t === "people") return builder(peopleRows, t);
      if (t === "phone_contacts") return builder(contactsRows, t);
      if (t === "branch_memberships") return builder(membershipsRows, t);
      if (t === "workspaces") return builder(workspacesRows, t);
      if (t === "organizations") return builder(orgsRows, t);
      return builder([], t);
    },
  }),
}));

import { ensurePerson, getKnownProfile } from "@/lib/services/identity/people";

beforeEach(() => {
  peopleRows.length = 0;
  contactsRows.length = 0;
  membershipsRows.length = 0;
  workspacesRows.length = 0;
  orgsRows.length = 0;
});

describe("ensurePerson", () => {
  it("creates a new person when none exists for the given phone", async () => {
    const id = await ensurePerson({ workspaceId: "ws1", fullName: "Ada Obi", phone: "2348001111111" });
    expect(id).toBeDefined();
    expect(peopleRows.length).toBe(1);
    expect(peopleRows[0].full_name).toBe("Ada Obi");
  });

  it("returns the existing person when phone already linked", async () => {
    peopleRows.push({ id: "p-existing", full_name: "Ada Obi" });
    contactsRows.push({ person_id: "p-existing", phone_number: "2348001111111", status: "active" });

    const id = await ensurePerson({ workspaceId: "ws1", fullName: "Ada O.", phone: "2348001111111" });
    expect(id).toBe("p-existing");
  });

  it("is idempotent — same phone returns same person", async () => {
    const id1 = await ensurePerson({ workspaceId: "ws1", fullName: "Ada Obi", phone: "2348001111111" });
    // Simulate the insert having happened
    contactsRows.push({ person_id: id1, phone_number: "2348001111111", status: "active" });

    const id2 = await ensurePerson({ workspaceId: "ws1", fullName: "Ada Obi", phone: "2348001111111" });
    expect(id2).toBe(id1);
  });

  it("creates a person without phone when only name is given", async () => {
    const id = await ensurePerson({ workspaceId: "ws1", fullName: "Sam Eze" });
    expect(id).toBeDefined();
    expect(peopleRows.length).toBe(1);
    expect(peopleRows[0].full_name).toBe("Sam Eze");
    expect(contactsRows.length).toBe(0);
  });

  it("updates full_name when creating with a name but existing person had empty name", async () => {
    peopleRows.push({ id: "p-empty", full_name: "" });
    contactsRows.push({ person_id: "p-empty", phone_number: "2348001111111", status: "active" });

    const id = await ensurePerson({ workspaceId: "ws1", fullName: "Ada Obi", phone: "2348001111111" });
    expect(id).toBe("p-empty");
    expect(peopleRows[0].full_name).toBe("Ada Obi");
  });

  it("does NOT auto-verify phone contacts — only inbound WhatsApp verifies", async () => {
    const id = await ensurePerson({ workspaceId: "ws1", fullName: "Ada", phone: "2348001111111" });
    const contact = contactsRows.find((c) => c.person_id === id);
    expect(contact).toBeDefined();
    expect(contact!.verified_at).toBeFalsy(); // null = unverified
  });
});

describe("getKnownProfile — WS1 never-re-ask", () => {
  beforeEach(() => {
    peopleRows.push({
      id: "p1", full_name: "Ada Obi", email: "ada@x.com", gender: "female",
      birthdate: "1990-05-01", address: "Lagos", marital_status: "married",
    });
    contactsRows.push({ person_id: "p1", phone_number: "2348001111111", status: "active", verified_at: "2026-08-01" });
    membershipsRows.push({ person_id: "p1", workspace_id: "ws1", role: "member", status: "active" });
    workspacesRows.push({ id: "ws1", organization_id: "o1", name: "Grace HQ" });
    orgsRows.push({ id: "o1", name: "Grace Chapel" });
  });

  it("assembles every stored field so the agent never has to ask again", async () => {
    const p = await getKnownProfile("p1");
    expect(p).toMatchObject({
      fullName: "Ada Obi",
      phone: "2348001111111",
      email: "ada@x.com",
      gender: "female",
      birthdate: "1990-05-01",
      address: "Lagos",
      maritalStatus: "married",
    });
    expect(p!.churches).toEqual([{ id: "o1", name: "Grace Chapel", role: "member" }]);
  });

  it("returns null for an unknown person id", async () => {
    expect(await getKnownProfile("nope")).toBeNull();
  });

  it("omits fields that are not stored (undefined, not empty strings)", async () => {
    peopleRows.push({ id: "p2", full_name: "Sam" });
    contactsRows.push({ person_id: "p2", phone_number: "2342", status: "active" });
    const p = await getKnownProfile("p2");
    expect(p!.email).toBeUndefined();
    expect(p!.gender).toBeUndefined();
    expect(p!.churches).toEqual([]);
  });
});
