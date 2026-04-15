import { describe, it, expect } from "vitest";
import type { WorkspaceSnapshot, ModuleKey } from "@/lib/types";

type RecordRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  module: ModuleKey;
  href: string;
};

function buildRecordRows(snapshot: WorkspaceSnapshot, workspaceSlug: string): RecordRow[] {
  const base = `/w/${workspaceSlug}/modules/toolkit`;
  const rows: RecordRow[] = [];

  for (const doc of snapshot.documents) {
    rows.push({ id: doc.id, title: doc.title, type: "Document", status: doc.status, module: "toolkit", href: `${base}/documents/${doc.id}` });
  }
  for (const req of snapshot.requests) {
    rows.push({ id: req.id, title: req.title, type: "Request", status: req.status, module: req.module, href: `${base}/requests/${req.id}` });
  }
  for (const expense of snapshot.expenses) {
    rows.push({ id: expense.id, title: expense.title, type: "Expense", status: expense.status, module: "toolkit", href: `${base}/expenses/${expense.id}` });
  }
  for (const issue of snapshot.issues) {
    rows.push({ id: issue.id, title: issue.title, type: "Issue", status: issue.status, module: "toolkit", href: `${base}/issues/${issue.id}` });
  }
  for (const poll of snapshot.polls) {
    rows.push({ id: poll.id, title: poll.title, type: "Poll", status: poll.status, module: "toolkit", href: `${base}/feedback/${poll.id}` });
  }
  for (const form of snapshot.forms) {
    rows.push({ id: form.id, title: form.name, type: "Form", status: "active", module: "toolkit", href: `${base}/forms/${form.id}` });
  }
  for (const appt of snapshot.appointments) {
    rows.push({ id: appt.id, title: appt.title, type: "Appointment", status: "scheduled", module: "toolkit", href: `${base}/appointments/${appt.id}` });
  }
  for (const person of snapshot.directory) {
    rows.push({ id: person.id, title: person.name, type: "Contact", status: "active", module: "toolkit", href: `${base}/directory/${person.id}` });
  }
  for (const item of snapshot.inventory) {
    rows.push({ id: item.id, title: item.name, type: "Inventory", status: "active", module: "toolkit", href: `${base}/inventory/${item.id}` });
  }

  return rows;
}

const emptySnapshot: WorkspaceSnapshot = {
  workspace: { slug: "demo", modules: ["toolkit"] as ModuleKey[], id: "", name: "", legalName: "", sector: "", city: "", timezone: "", currency: "NGN", brand: { accent: "", secondary: "", paper: "", highlight: "" } },
  membership: { id: "", workspaceId: "", userName: "", email: "", role: "owner" as const, title: "", avatarInitials: "" },
  documents: [], requests: [], expenses: [], issues: [], polls: [], forms: [], appointments: [], directory: [], inventory: [],
  notifications: [], conversations: [], giving: [], careRequests: [], products: [], orders: [], invoices: [], receipts: [], paymentLinks: [], events: [], registrations: [], tickets: [], checkIns: [], activities: [],
};

describe("buildRecordRows", () => {
  it("returns empty array when snapshot has no records", () => {
    expect(buildRecordRows(emptySnapshot, "demo")).toHaveLength(0);
  });

  it("maps documents to rows with correct type and href", () => {
    const snap: WorkspaceSnapshot = { ...emptySnapshot, documents: [{ id: "doc-1", title: "Vendor letter", type: "letter" as const, body: "", status: "draft" as const, preparedBy: "Alex", createdAtLabel: "Today" }] };
    const rows = buildRecordRows(snap, "demo");
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("Document");
    expect(rows[0].href).toBe("/w/demo/modules/toolkit/documents/doc-1");
  });

  it("maps issues correctly", () => {
    const snap: WorkspaceSnapshot = { ...emptySnapshot, issues: [{ id: "iss-1", title: "Broken pipe", area: "Toilet", severity: "high" as const, status: "pending" as const, mediaCount: 0, reportedBy: "Sam" }] };
    const rows = buildRecordRows(snap, "demo");
    expect(rows[0].type).toBe("Issue");
    expect(rows[0].href).toContain("/issues/iss-1");
  });
});
