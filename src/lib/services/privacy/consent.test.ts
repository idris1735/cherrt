import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({
  store: {
    people: [] as any[],
    contacts: [] as any[],
    requests: [] as any[],
  },
}));

function builder(rows: any[], table: string) {
  let filtered = [...rows];
  const api: any = {
    select: () => api,
    eq: (k: string, v: any) => { filtered = filtered.filter((r) => r[k] === v); return api; },
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null }),
    update: (patch: any) => {
      for (const r of rows) Object.assign(r, patch);
      const uq: any = { eq: () => uq, then: (res: any) => res({ error: null }) };
      return uq;
    },
    insert: (row: any) => {
      rows.push({ id: `id-${rows.length + 1}`, ...row });
      return Promise.resolve({ error: null });
    },
  };
  return api;
}

vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (t: string) => {
      if (t === "people") return builder(store.people, "people");
      if (t === "phone_contacts") return builder(store.contacts, "phone_contacts");
      if (t === "data_requests") return builder(store.requests, "data_requests");
      return builder([], t);
    },
  }),
}));

import { recordConsent, isOptedOut, setOptedOut, clearOptOut, logDataRequest, CONSENT_VERSION } from "@/lib/services/privacy/consent";

beforeEach(() => { store.people.length = 0; store.contacts.length = 0; store.requests.length = 0; });

describe("recordConsent", () => {
  it("stamps versioned consent on the person", async () => {
    store.people.push({ id: "p1", full_name: "Ada" });
    await recordConsent({ personId: "p1", source: "whatsapp_first_contact" });
    expect(store.people[0].consent_source).toBe("whatsapp_first_contact");
    expect(store.people[0].consent_version).toBe(CONSENT_VERSION);
    expect(store.people[0].consent_at).toBeTruthy();
  });

  it("records guardian-given consent with the guardian id", async () => {
    store.people.push({ id: "child1", full_name: "Amara" });
    await recordConsent({ personId: "child1", source: "guardian", guardianPersonId: "parent1" });
    expect(store.people[0].consent_source).toBe("guardian");
  });
});

describe("opt-out per phone number", () => {
  it("isOptedOut is false by default, true after setOptedOut, cleared by clearOptOut", async () => {
    store.contacts.push({ id: "c1", person_id: "p1", phone_number: "234800", status: "active", opted_out: false });
    expect(await isOptedOut("234800")).toBe(false);
    await setOptedOut("234800");
    expect(await isOptedOut("234800")).toBe(true);
    expect(store.contacts[0].opted_out_at).toBeTruthy();
    await clearOptOut("234800");
    expect(await isOptedOut("234800")).toBe(false);
  });

  it("returns false for an unknown phone", async () => {
    expect(await isOptedOut("234999")).toBe(false);
  });
});

describe("logDataRequest", () => {
  it("captures an access request", async () => {
    await logDataRequest({ kind: "access", note: "copy of my data", personId: "p1" });
    expect(store.requests[0]).toMatchObject({ kind: "access", status: "open", person_id: "p1" });
  });

  it("captures a deletion request", async () => {
    await logDataRequest({ kind: "deletion", note: "remove me" });
    expect(store.requests[0]).toMatchObject({ kind: "deletion", status: "open" });
  });
});
