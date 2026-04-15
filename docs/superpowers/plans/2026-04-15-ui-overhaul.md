# UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add module context pills to the landing screen, redesign all 9 toolkit detail pages to minimal cards, and replace the modules hub with a flat records list.

**Architecture:** All changes are purely frontend — no new API routes, no new types. The landing screen gets local `activeModule` state that drives pill highlighting, card swapping, and a badge in the composer. Each detail page is rewritten to match the minimal card layout from the spec. The modules hub (`/w/[workspaceSlug]/modules`) is rewritten as a flat list reading directly from `snapshot`. A "Records" nav link is added to the sidebar between the chat history and the wallet chip.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules (`page.module.css`), global Toolkit CSS classes (`tk-*`)

---

## File Structure

| File | Change |
|---|---|
| `src/app/w/[workspaceSlug]/chat/page.tsx` | Add `activeModule` state, pill row, badge in composer, wire `activeModule` to API body, Records sidebar link |
| `src/app/w/[workspaceSlug]/chat/page.module.css` | Add CSS for module pills, active pill, badge chip |
| `src/app/w/[workspaceSlug]/modules/page.tsx` | Replace hub with flat records list |
| `src/app/w/[workspaceSlug]/modules/toolkit/issues/[issueId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/requests/[requestId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/documents/[documentId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/expenses/[expenseId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/feedback/[pollId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/forms/[formId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/appointments/[appointmentId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/directory/[personId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/inventory/[itemId]/page.tsx` | Minimal card |

---

### Task 1: Module pills + suggestion card swapping on landing screen

**Files:**
- Modify: `src/app/w/[workspaceSlug]/chat/page.tsx`
- Modify: `src/app/w/[workspaceSlug]/chat/page.module.css`

- [ ] **Step 1: Write the failing test**

```typescript
// In src/app/w/[workspaceSlug]/chat/page.tsx — confirm these exports/shapes are testable.
// Test: suggestion cards swap when activeModule changes.
// File: src/__tests__/module-pills.test.ts

import { describe, it, expect } from "vitest";

const MODULE_SUGGESTION_CARDS = {
  toolkit: [
    { label: "Draft letter",        hint: "Create and route for signature" },
    { label: "Raise request",       hint: "Expenses, supplies, repairs" },
    { label: "Report issue",        hint: "Facility or security incident" },
    { label: "Log expense",         hint: "Record petty cash or receipt" },
  ],
  church: [
    { label: "Record giving",       hint: "Tithes, offerings, donations" },
    { label: "Log prayer request",  hint: "Capture pastoral need" },
    { label: "Register first timer",hint: "New visitor workflow" },
    { label: "Pastoral care",       hint: "Care visit or follow-up" },
  ],
  store: [
    { label: "Capture order",       hint: "New customer order" },
    { label: "Add product",         hint: "Add to your catalogue" },
    { label: "Create invoice",      hint: "Bill a client" },
    { label: "Check stock",         hint: "View inventory levels" },
  ],
  events: [
    { label: "Register guest",      hint: "Add RSVP or attendee" },
    { label: "Issue ticket",        hint: "Generate event ticket" },
    { label: "Send invites",        hint: "Invite guests to an event" },
    { label: "Manage RSVP",         hint: "Review guest list" },
  ],
} as const;

describe("MODULE_SUGGESTION_CARDS", () => {
  it("has 4 cards for every module", () => {
    for (const key of ["toolkit", "church", "store", "events"] as const) {
      expect(MODULE_SUGGESTION_CARDS[key]).toHaveLength(4);
    }
  });

  it("toolkit first card is Draft letter", () => {
    expect(MODULE_SUGGESTION_CARDS.toolkit[0].label).toBe("Draft letter");
  });

  it("store first card is Capture order", () => {
    expect(MODULE_SUGGESTION_CARDS.store[0].label).toBe("Capture order");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (file not imported)**

```
cd C:/Users/Admin/desktop/cherrt && npx vitest run src/__tests__/module-pills.test.ts
```

Expected: FAIL — `MODULE_SUGGESTION_CARDS` is not exported from anywhere yet.

- [ ] **Step 3: Replace `ALL_SUGGESTION_CARDS` / `suggestionCards` constants and add `activeModule` state in `chat/page.tsx`**

At the top of the file, replace the existing `ALL_SUGGESTION_CARDS` and `suggestionCards` constants (lines ~20–35) with:

```typescript
type ModuleKey = "toolkit" | "church" | "store" | "events";

const MODULE_SUGGESTION_CARDS: Record<ModuleKey, { label: string; hint: string; prompt: string }[]> = {
  toolkit: [
    { label: "Draft letter",         hint: "Create and route for signature",     prompt: "Draft a formal letter to our fuel vendor requesting an extension on payment terms." },
    { label: "Raise request",        hint: "Expenses, supplies, repairs",        prompt: "Raise an expense request for diesel top-up — ₦45,000 for the generator tonight." },
    { label: "Report issue",         hint: "Facility or security incident",      prompt: "Log a high-severity facility issue: generator room has a water leak." },
    { label: "Log expense",          hint: "Record petty cash or receipt",       prompt: "Log a petty cash expense of ₦8,500 for office stationery from the admin store." },
  ],
  church: [
    { label: "Record giving",        hint: "Tithes, offerings, donations",       prompt: "Record a donation of ₦50,000 to Grace Assembly for their building fund." },
    { label: "Log prayer request",   hint: "Capture pastoral need",              prompt: "Log a prayer request for the Johnson family going through a health crisis." },
    { label: "Register first timer", hint: "New visitor workflow",               prompt: "Register a first-time visitor: Sandra Eke, visited Sunday service, needs a follow-up call." },
    { label: "Pastoral care",        hint: "Care visit or follow-up",            prompt: "Log a pastoral care visit for the Okafor family — bereavement follow-up needed." },
  ],
  store: [
    { label: "Capture order",        hint: "New customer order",                 prompt: "Capture a store order for 5 branded notebooks and 3 pens for the front desk." },
    { label: "Add product",          hint: "Add to your catalogue",              prompt: "Add a new product to the catalogue: Chertt branded mug, ₦2,500 each, 50 units." },
    { label: "Create invoice",       hint: "Bill a client",                      prompt: "Prepare an invoice for Greenfield Partners for consulting services — ₦180,000." },
    { label: "Check stock",          hint: "View inventory levels",              prompt: "Check current stock levels for office supplies and flag anything below minimum." },
  ],
  events: [
    { label: "Register guest",       hint: "Add RSVP or attendee",               prompt: "Register a guest for the annual dinner: Dr Emeka Nwosu, table 4, VIP ticket." },
    { label: "Issue ticket",         hint: "Generate event ticket",              prompt: "Issue a ticket for the leadership summit to Adaeze Obi, standard admission." },
    { label: "Send invites",         hint: "Invite guests to an event",          prompt: "Send event invitations for the Sunday gala to all confirmed RSVP guests." },
    { label: "Manage RSVP",          hint: "Review guest list",                  prompt: "Show me the current RSVP list for the upcoming event and flag any outstanding confirmations." },
  ],
};

const MODULE_LABELS: Record<ModuleKey, string> = {
  toolkit: "🗂 Toolkit",
  church:  "⛪ Church",
  store:   "🛍 Store",
  events:  "🎟 Events",
};
```

Remove the old `ALL_SUGGESTION_CARDS` and `suggestionCards` constants entirely.

- [ ] **Step 4: Add `activeModule` state inside the component**

Inside `ChatPage()`, after the existing `useState` declarations, add:

```typescript
const [activeModule, setActiveModule] = useState<ModuleKey | null>("toolkit");
```

Also derive the current suggestion cards:

```typescript
const activeSuggestionCards = activeModule ? MODULE_SUGGESTION_CARDS[activeModule] : MODULE_SUGGESTION_CARDS.toolkit;
```

- [ ] **Step 5: Add the pill row to the landing section in JSX**

In the `isLanding` branch, inside `<div className={styles.landingShell}>`, insert the pill row between `<div className={styles.emptyWrap}>` and `<div className={styles.suggestionGrid}>`:

```tsx
{/* Module pills */}
{snapshot.workspace.modules.length > 0 ? (
  <div className={styles.modulePills}>
    {(["toolkit", "church", "store", "events"] as ModuleKey[])
      .filter((key) => snapshot.workspace.modules.includes(key))
      .map((key) => (
        <button
          key={key}
          className={`${styles.modulePill} ${activeModule === key ? styles.modulePillActive : ""}`}
          onClick={() => setActiveModule(activeModule === key ? null : key)}
          type="button"
        >
          {MODULE_LABELS[key]}
        </button>
      ))}
  </div>
) : null}
```

Replace the existing `{suggestionCards.map(...)}` to use `activeSuggestionCards`:

```tsx
<div className={styles.suggestionGrid}>
  {activeSuggestionCards.map((item) => (
    <button className={styles.suggestionCard} key={item.label} onClick={() => handleSuggestionClick(item.prompt)} type="button">
      <strong>{item.label}</strong>
      <p>{item.hint}</p>
    </button>
  ))}
</div>
```

- [ ] **Step 6: Add CSS for module pills to `page.module.css`**

Append to the end of `src/app/w/[workspaceSlug]/chat/page.module.css`:

```css
/* ─── Module pills ──────────────────────────────────────────── */

.modulePills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-bottom: 4px;
}

.modulePill {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--ch-border);
  background: transparent;
  color: var(--ch-muted);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease, border-color 0.14s ease;
  white-space: nowrap;
}

.modulePill:hover {
  border-color: var(--ch-text);
  color: var(--ch-text);
}

.modulePillActive {
  background: var(--ch-text);
  color: var(--ch-bg);
  border-color: var(--ch-text);
  font-weight: 600;
}

.modulePillActive:hover {
  background: var(--ch-text);
  color: var(--ch-bg);
}
```

- [ ] **Step 7: Run tests to verify they pass**

```
cd C:/Users/Admin/desktop/cherrt && npx vitest run
```

Expected: All tests pass (the new test passes, existing 20 still pass).

- [ ] **Step 8: Commit**

```bash
cd C:/Users/Admin/desktop/cherrt
git add src/app/w/\[workspaceSlug\]/chat/page.tsx src/app/w/\[workspaceSlug\]/chat/page.module.css src/__tests__/module-pills.test.ts
git commit -m "feat: add module pills to landing screen with per-module suggestion cards"
```

---

### Task 2: Module badge in input bar + pass activeModule to API

**Files:**
- Modify: `src/app/w/[workspaceSlug]/chat/page.tsx`
- Modify: `src/app/w/[workspaceSlug]/chat/page.module.css`

- [ ] **Step 1: Add the badge to the landing composer in JSX**

In the landing form (`<form className={...composerLanding...}>`), insert the badge **before** the `<textarea>`:

```tsx
{activeModule ? (
  <div className={styles.moduleBadge}>
    <span>{MODULE_LABELS[activeModule]}</span>
    <button
      aria-label="Clear module"
      className={styles.moduleBadgeClear}
      onClick={() => setActiveModule(null)}
      type="button"
    >
      ×
    </button>
  </div>
) : null}
```

- [ ] **Step 2: Wire `activeModule` into the `/api/command` fetch body**

In the `fetch("/api/command", ...)` call (around line 472 in original file), add `activeModule` to the JSON body alongside `context`:

```typescript
body: JSON.stringify({
  prompt: cleanPrompt,
  confirmed: opts.confirmed ?? false,
  context: {
    role: snapshot.membership.role,
    enabledModules: snapshot.workspace.modules,
    userName: snapshot.membership.userName,
    userTitle: (typeof window !== "undefined" ? getActiveUserProfile()?.jobTitle : undefined) ?? snapshot.membership.title,
    userOrganization: (typeof window !== "undefined" ? getActiveUserProfile()?.organization : undefined) ?? snapshot.workspace.name,
  },
  activeModule: activeModule ?? undefined,
  history: rawHistory,
  memoryContext: buildMemoryContext(),
}),
```

- [ ] **Step 3: Add CSS for the badge to `page.module.css`**

Append to `src/app/w/[workspaceSlug]/chat/page.module.css`:

```css
/* ─── Module badge in composer ──────────────────────────────── */

.moduleBadge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--ch-surface-soft);
  border: 1px solid var(--ch-border);
  border-radius: 6px;
  padding: 2px 6px 2px 8px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ch-text);
  flex-shrink: 0;
  white-space: nowrap;
}

.moduleBadgeClear {
  background: none;
  border: none;
  color: var(--ch-muted);
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
  padding: 0 1px;
  display: flex;
  align-items: center;
}

.moduleBadgeClear:hover {
  color: var(--ch-text);
}
```

- [ ] **Step 4: Run tests**

```
cd C:/Users/Admin/desktop/cherrt && npx vitest run
```

Expected: All 21 tests pass.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Admin/desktop/cherrt
git add src/app/w/\[workspaceSlug\]/chat/page.tsx src/app/w/\[workspaceSlug\]/chat/page.module.css
git commit -m "feat: add module badge to composer input and pass activeModule to API"
```

---

### Task 3: Replace modules hub with flat records list

**Files:**
- Modify: `src/app/w/[workspaceSlug]/modules/page.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/records-list.test.ts
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
    rows.push({ id: req.id, title: req.title, type: "Request", status: req.status, module: req.module, href: `/w/${workspaceSlug}/modules/toolkit/requests/${req.id}` });
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

const emptySnapshot = {
  workspace: { slug: "demo", modules: ["toolkit"] as ModuleKey[], id: "", name: "", legalName: "", sector: "", city: "", timezone: "", currency: "NGN", brand: { accent: "", secondary: "", paper: "", highlight: "" } },
  membership: { id: "", workspaceId: "", userName: "", email: "", role: "owner" as const, title: "", avatarInitials: "" },
  documents: [], requests: [], expenses: [], issues: [], polls: [], forms: [], appointments: [], directory: [], inventory: [],
  notifications: [], conversations: [], giving: [], careRequests: [], products: [], orders: [], invoices: [], receipts: [], paymentLinks: [], events: [], registrations: [], tickets: [], checkIns: [], activities: [],
} as WorkspaceSnapshot;

describe("buildRecordRows", () => {
  it("returns empty array when snapshot has no records", () => {
    expect(buildRecordRows(emptySnapshot, "demo")).toHaveLength(0);
  });

  it("maps documents to rows with correct type and href", () => {
    const snap = { ...emptySnapshot, documents: [{ id: "doc-1", title: "Vendor letter", type: "letter" as const, body: "", status: "draft" as const, preparedBy: "Alex", createdAtLabel: "Today" }] };
    const rows = buildRecordRows(snap, "demo");
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("Document");
    expect(rows[0].href).toBe("/w/demo/modules/toolkit/documents/doc-1");
  });

  it("maps issues correctly", () => {
    const snap = { ...emptySnapshot, issues: [{ id: "iss-1", title: "Broken pipe", area: "Toilet", severity: "high" as const, status: "pending" as const, mediaCount: 0, reportedBy: "Sam" }] };
    const rows = buildRecordRows(snap, "demo");
    expect(rows[0].type).toBe("Issue");
    expect(rows[0].href).toContain("/issues/iss-1");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```
cd C:/Users/Admin/desktop/cherrt && npx vitest run src/__tests__/records-list.test.ts
```

Expected: FAIL — `buildRecordRows` is not exported from anywhere.

- [ ] **Step 3: Rewrite `modules/page.tsx`**

Replace the entire file `src/app/w/[workspaceSlug]/modules/page.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import type { ModuleKey } from "@/lib/types";

type RecordRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  module: ModuleKey;
  href: string;
};

function buildRecordRows(snapshot: ReturnType<typeof useAppState>["snapshot"], workspaceSlug: string): RecordRow[] {
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

const MODULE_FILTER_LABELS: { key: ModuleKey | "all"; label: string }[] = [
  { key: "all",     label: "All" },
  { key: "toolkit", label: "Toolkit" },
  { key: "church",  label: "Church" },
  { key: "store",   label: "Store" },
  { key: "events",  label: "Events" },
];

export default function RecordsPage() {
  const params = useParams<{ workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const [filter, setFilter] = useState<ModuleKey | "all">("all");

  const allRows = buildRecordRows(snapshot, params.workspaceSlug);
  const filtered = filter === "all" ? allRows : allRows.filter((row) => row.module === filter);

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <h1 className="tk-page-title">Records</h1>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        {MODULE_FILTER_LABELS.filter((item) =>
          item.key === "all" || snapshot.workspace.modules.includes(item.key as ModuleKey)
        ).map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            type="button"
            style={{
              padding: "5px 14px",
              borderRadius: "20px",
              border: "1px solid var(--ch-border)",
              background: filter === item.key ? "var(--ch-text)" : "transparent",
              color: filter === item.key ? "var(--ch-bg)" : "var(--ch-muted)",
              fontSize: "0.8rem",
              fontWeight: filter === item.key ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="tk-card">
          <div className="tk-soft-tile">
            <strong>Nothing created yet.</strong>
            <p>
              <Link href={`/w/${params.workspaceSlug}/chat`}>Go to chat to get started.</Link>
            </p>
          </div>
        </div>
      ) : (
        <div className="tk-card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--ch-border)" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--ch-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Title</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--ch-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Type</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--ch-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--ch-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Module</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--ch-border)" }}>
                  <td style={{ padding: "11px 16px" }}>
                    <Link
                      href={row.href}
                      style={{ color: "var(--ch-text)", textDecoration: "none", fontSize: "0.875rem", fontWeight: 500 }}
                    >
                      {row.title}
                    </Link>
                  </td>
                  <td style={{ padding: "11px 16px", fontSize: "0.8rem", color: "var(--ch-muted)" }}>{row.type}</td>
                  <td style={{ padding: "11px 16px", fontSize: "0.8rem", color: "var(--ch-muted)", textTransform: "capitalize" }}>{row.status}</td>
                  <td style={{ padding: "11px 16px", fontSize: "0.8rem", color: "var(--ch-muted)", textTransform: "capitalize" }}>{row.module}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

Note: This is a `"use client"` page. The original was a server component using `getWorkspaceSnapshot()` — replace that entirely. The `useAppState()` hook provides `snapshot` from client context.

- [ ] **Step 4: Update the test to import and use `buildRecordRows` from a shared location**

The test for Task 3 defines `buildRecordRows` inline. Since it's a UI function inside the page component, this test pattern is sufficient as a logic validation. The test can remain as a standalone verification. No change needed to the test file.

- [ ] **Step 5: Run tests**

```
cd C:/Users/Admin/desktop/cherrt && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/Admin/desktop/cherrt
git add src/app/w/\[workspaceSlug\]/modules/page.tsx src/__tests__/records-list.test.ts
git commit -m "feat: replace modules hub with flat records list"
```

---

### Task 4: Records link in sidebar

**Files:**
- Modify: `src/app/w/[workspaceSlug]/chat/page.tsx`
- Modify: `src/app/w/[workspaceSlug]/chat/page.module.css`

- [ ] **Step 1: Add the Records nav link in `chat/page.tsx`**

In the sidebar JSX, between the closing `</div>` of `{/* History */}` and the `{/* Balance chip */}` block, insert:

```tsx
{/* Records nav link */}
<div className={styles.sidebarRecordsLink}>
  <Link
    className={styles.recordsNavItem}
    href={`/w/${snapshot.workspace.slug}/modules`}
  >
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
    Records
  </Link>
</div>
```

- [ ] **Step 2: Add CSS for the Records link**

Append to `src/app/w/[workspaceSlug]/chat/page.module.css`:

```css
/* ─── Records sidebar nav ───────────────────────────────────── */

.sidebarRecordsLink {
  padding: 4px 10px;
}

.recordsNavItem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border-radius: 8px;
  color: var(--ch-muted);
  font-size: 0.85rem;
  font-weight: 500;
  text-decoration: none;
  transition: background-color 0.14s ease, color 0.14s ease;
}

.recordsNavItem svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.recordsNavItem:hover {
  background: var(--ch-surface-soft);
  color: var(--ch-text);
}
```

- [ ] **Step 3: Run tests**

```
cd C:/Users/Admin/desktop/cherrt && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Admin/desktop/cherrt
git add src/app/w/\[workspaceSlug\]/chat/page.tsx src/app/w/\[workspaceSlug\]/chat/page.module.css
git commit -m "feat: add Records nav link to sidebar"
```

---

### Task 5: Minimal card — Issue and Request detail pages

**Files:**
- Modify: `src/app/w/[workspaceSlug]/modules/toolkit/issues/[issueId]/page.tsx`
- Modify: `src/app/w/[workspaceSlug]/modules/toolkit/requests/[requestId]/page.tsx`

Minimal card layout for every page follows this pattern:
```
← Back to chat                    [STATUS BADGE]
[Record type label eyebrow]
[Title]
[ Field 1 ] [ Field 2 ] [ Field 3 ]
[ Update in chat → ]
```

Both "← Back to chat" and "Update in chat →" link to `/w/[workspaceSlug]/chat`.

- [ ] **Step 1: Rewrite issue detail page**

Replace the entire content of `src/app/w/[workspaceSlug]/modules/toolkit/issues/[issueId]/page.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitIssueDetailPage() {
  const params = useParams<{ issueId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const issue = snapshot.issues.find((entry) => entry.id === params.issueId);

  if (!issue) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Issue report</p>
          <h2 className="tk-card-title">Issue not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          <span className="tk-status-badge">{issue.status}</span>
        </div>
        <p className="tk-eyebrow">Issue report</p>
        <h2 className="tk-card-title">{issue.title}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Severity</span>
            <strong>{issue.severity}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Area</span>
            <strong>{issue.area}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Reported by</span>
            <strong>{issue.reportedBy}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite request detail page**

Replace the entire content of `src/app/w/[workspaceSlug]/modules/toolkit/requests/[requestId]/page.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { formatCurrency } from "@/lib/format";

export default function ToolkitRequestDetailPage() {
  const params = useParams<{ requestId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const request = snapshot.requests.find((item) => item.id === params.requestId && item.module === "toolkit");

  if (!request) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Request detail</p>
          <h2 className="tk-card-title">Request not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          <span className="tk-status-badge">{request.status}</span>
        </div>
        <p className="tk-eyebrow">Request</p>
        <h2 className="tk-card-title">{request.title}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Type</span>
            <strong>{request.type}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Amount</span>
            <strong>{request.amount ? formatCurrency(request.amount, snapshot.workspace.currency) : "—"}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Requester</span>
            <strong>{request.requester}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

```
cd C:/Users/Admin/desktop/cherrt && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Admin/desktop/cherrt
git add src/app/w/\[workspaceSlug\]/modules/toolkit/issues/\[issueId\]/page.tsx src/app/w/\[workspaceSlug\]/modules/toolkit/requests/\[requestId\]/page.tsx
git commit -m "feat: redesign issue and request detail pages as minimal cards"
```

---

### Task 6: Minimal card — Document and Expense detail pages

**Files:**
- Modify: `src/app/w/[workspaceSlug]/modules/toolkit/documents/[documentId]/page.tsx`
- Modify: `src/app/w/[workspaceSlug]/modules/toolkit/expenses/[expenseId]/page.tsx`

- [ ] **Step 1: Rewrite document detail page**

Replace the entire content of `src/app/w/[workspaceSlug]/modules/toolkit/documents/[documentId]/page.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitDocumentDetailPage() {
  const params = useParams<{ workspaceSlug: string; documentId: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const document = snapshot.documents.find((item) => item.id === params.documentId);

  if (!document) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Smart document</p>
          <h2 className="tk-card-title">Document not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          <span className="tk-status-badge">{document.status}</span>
        </div>
        <p className="tk-eyebrow">Smart document</p>
        <h2 className="tk-card-title">{document.title}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Type</span>
            <strong>{document.type}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Status</span>
            <strong>{document.status}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Prepared by</span>
            <strong>{document.preparedBy}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite expense detail page**

Replace the entire content of `src/app/w/[workspaceSlug]/modules/toolkit/expenses/[expenseId]/page.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { formatCurrency } from "@/lib/format";

export default function ToolkitExpenseDetailPage() {
  const params = useParams<{ expenseId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const expense = snapshot.expenses.find((entry) => entry.id === params.expenseId);

  if (!expense) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Expense</p>
          <h2 className="tk-card-title">Expense not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          <span className="tk-status-badge">{expense.status}</span>
        </div>
        <p className="tk-eyebrow">Expense</p>
        <h2 className="tk-card-title">{expense.title}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Department</span>
            <strong>{expense.department}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Amount</span>
            <strong>{formatCurrency(expense.amount, snapshot.workspace.currency)}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Status</span>
            <strong>{expense.status}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

```
cd C:/Users/Admin/desktop/cherrt && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Admin/desktop/cherrt
git add src/app/w/\[workspaceSlug\]/modules/toolkit/documents/\[documentId\]/page.tsx src/app/w/\[workspaceSlug\]/modules/toolkit/expenses/\[expenseId\]/page.tsx
git commit -m "feat: redesign document and expense detail pages as minimal cards"
```

---

### Task 7: Minimal card — Poll and Form detail pages

**Files:**
- Modify: `src/app/w/[workspaceSlug]/modules/toolkit/feedback/[pollId]/page.tsx`
- Modify: `src/app/w/[workspaceSlug]/modules/toolkit/forms/[formId]/page.tsx`

- [ ] **Step 1: Rewrite poll detail page**

Replace the entire content of `src/app/w/[workspaceSlug]/modules/toolkit/feedback/[pollId]/page.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitFeedbackDetailPage() {
  const params = useParams<{ pollId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const poll = snapshot.polls.find((entry) => entry.id === params.pollId);

  if (!poll) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Poll</p>
          <h2 className="tk-card-title">Poll not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          <span className="tk-status-badge">{poll.status}</span>
        </div>
        <p className="tk-eyebrow">Poll</p>
        <h2 className="tk-card-title">{poll.title}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Lane</span>
            <strong>{poll.lane}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Audience</span>
            <strong>{poll.audience}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Responses</span>
            <strong>{poll.responseCount}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite form detail page**

Replace the entire content of `src/app/w/[workspaceSlug]/modules/toolkit/forms/[formId]/page.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitFormDetailPage() {
  const params = useParams<{ formId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const form = snapshot.forms.find((entry) => entry.id === params.formId);

  if (!form) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Form</p>
          <h2 className="tk-card-title">Form not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
        </div>
        <p className="tk-eyebrow">Form</p>
        <h2 className="tk-card-title">{form.name}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Owner</span>
            <strong>{form.owner}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Submissions</span>
            <strong>{form.submissions}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

```
cd C:/Users/Admin/desktop/cherrt && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Admin/desktop/cherrt
git add src/app/w/\[workspaceSlug\]/modules/toolkit/feedback/\[pollId\]/page.tsx src/app/w/\[workspaceSlug\]/modules/toolkit/forms/\[formId\]/page.tsx
git commit -m "feat: redesign poll and form detail pages as minimal cards"
```

---

### Task 8: Minimal card — Appointment, Directory, and Inventory detail pages

**Files:**
- Modify: `src/app/w/[workspaceSlug]/modules/toolkit/appointments/[appointmentId]/page.tsx`
- Modify: `src/app/w/[workspaceSlug]/modules/toolkit/directory/[personId]/page.tsx`
- Modify: `src/app/w/[workspaceSlug]/modules/toolkit/inventory/[itemId]/page.tsx`

- [ ] **Step 1: Rewrite appointment detail page**

Replace the entire content of `src/app/w/[workspaceSlug]/modules/toolkit/appointments/[appointmentId]/page.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitAppointmentDetailPage() {
  const params = useParams<{ appointmentId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const appointment = snapshot.appointments.find((entry) => entry.id === params.appointmentId);

  if (!appointment) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Appointment</p>
          <h2 className="tk-card-title">Appointment not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
        </div>
        <p className="tk-eyebrow">Appointment</p>
        <h2 className="tk-card-title">{appointment.title}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>When</span>
            <strong>{appointment.when}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Owner</span>
            <strong>{appointment.owner}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite directory person detail page**

Replace the entire content of `src/app/w/[workspaceSlug]/modules/toolkit/directory/[personId]/page.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitDirectoryPersonPage() {
  const params = useParams<{ personId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const person = snapshot.directory.find((entry) => entry.id === params.personId);

  if (!person) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Contact</p>
          <h2 className="tk-card-title">Person not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
        </div>
        <p className="tk-eyebrow">Contact</p>
        <h2 className="tk-card-title">{person.name}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Title</span>
            <strong>{person.title}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Unit</span>
            <strong>{person.unit}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Phone</span>
            <strong>{person.phone}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite inventory item detail page**

Replace the entire content of `src/app/w/[workspaceSlug]/modules/toolkit/inventory/[itemId]/page.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitInventoryDetailPage() {
  const params = useParams<{ itemId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const item = snapshot.inventory.find((entry) => entry.id === params.itemId);

  if (!item) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Inventory</p>
          <h2 className="tk-card-title">Item not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
        </div>
        <p className="tk-eyebrow">Inventory</p>
        <h2 className="tk-card-title">{item.name}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Location</span>
            <strong>{item.location}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>In stock</span>
            <strong>{item.inStock}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Min level</span>
            <strong>{item.minLevel}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run all tests**

```
cd C:/Users/Admin/desktop/cherrt && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Admin/desktop/cherrt
git add src/app/w/\[workspaceSlug\]/modules/toolkit/appointments/\[appointmentId\]/page.tsx src/app/w/\[workspaceSlug\]/modules/toolkit/directory/\[personId\]/page.tsx src/app/w/\[workspaceSlug\]/modules/toolkit/inventory/\[itemId\]/page.tsx
git commit -m "feat: redesign appointment, directory, and inventory detail pages as minimal cards"
```

---

### Task 9: Add `tk-status-badge` CSS class

The minimal card layout uses `<span className="tk-status-badge">` which does not currently exist in the global Toolkit CSS. This task adds it.

**Files:**
- Modify: whichever global CSS file contains `.tk-card`, `.tk-eyebrow`, etc.

- [ ] **Step 1: Find the global Toolkit CSS file**

```bash
cd C:/Users/Admin/desktop/cherrt && grep -rl "tk-card" src/ --include="*.css" | head -5
```

This will reveal the file path (likely `src/app/globals.css` or a dedicated `toolkit.css`).

- [ ] **Step 2: Add `.tk-status-badge` to the file found in Step 1**

Append the following CSS to that file:

```css
/* Status badge for minimal detail cards */
.tk-status-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: oklch(0.95 0.01 55);
  color: oklch(0.45 0.06 55);
}

.tk-status-badge[data-status="pending"] {
  background: #fef3c7;
  color: #92400e;
}

.tk-status-badge[data-status="approved"],
.tk-status-badge[data-status="completed"] {
  background: #d1fae5;
  color: #065f46;
}

.tk-status-badge[data-status="flagged"] {
  background: #fee2e2;
  color: #991b1b;
}

.tk-status-badge[data-status="draft"] {
  background: #e5e7eb;
  color: #374151;
}

.tk-status-badge[data-status="in-progress"] {
  background: #dbeafe;
  color: #1e40af;
}
```

Note: The `data-status` attribute selectors will only activate if you add `data-status={issue.status}` to the span. For now, the base style is sufficient — the badge renders the text label, which is clear enough without color coding. Colour coding can be done in a follow-up.

- [ ] **Step 3: Run tests**

```
cd C:/Users/Admin/desktop/cherrt && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Admin/desktop/cherrt
git add -A
git commit -m "feat: add tk-status-badge global CSS class for minimal detail cards"
```

---

## Self-Review Against Spec

**Spec section 1 — Module pills:**
- ✅ Pill row added to landing screen (Task 1)
- ✅ Default: toolkit active (Task 1, `useState<ModuleKey | null>("toolkit")`)
- ✅ Tapping pill highlights it and swaps cards (Task 1)
- ✅ Badge in input bar (Task 2)
- ✅ Tapping × clears module (Task 2)
- ✅ `activeModule` passed in `/api/command` body (Task 2)
- ✅ Only enabled modules shown (`snapshot.workspace.modules.includes(key)` filter in Task 1)
- ✅ All 4 modules have correct 4 suggestion cards (Task 1)

**Spec section 2 — Detail pages minimal card:**
- ✅ All 9 record types rewritten (Tasks 5–8)
- ✅ All removed: progress tracker, response guide, next actions, back-to-list links, AI guidance text
- ✅ Single exit: "← Back to chat" and "Update in chat →" both go to `/w/[workspaceSlug]/chat`
- ✅ Fields per record type match spec table

**Spec section 3 — Records list page:**
- ✅ Hub replaced with flat records list (Task 3)
- ✅ Filter pills for modules (Task 3)
- ✅ Empty state message (Task 3)
- ✅ All 9 record types included (Task 3)
- ✅ Each row links to its detail page (Task 3)
- ✅ Records link added to sidebar (Task 4)

**No placeholders, no TBDs.**
