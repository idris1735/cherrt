"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { StatusPill } from "@/components/shared/status-pill";
import type { ModuleKey, WorkflowStatus, WorkspaceSnapshot } from "@/lib/types";

type RecordRow = {
  id: string;
  title: string;
  type: string;
  status: WorkflowStatus;
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
    rows.push({ id: req.id, title: req.title, type: "Request", status: req.status, module: req.module, href: `/w/${workspaceSlug}/modules/${req.module}/requests/${req.id}` });
  }
  for (const expense of snapshot.expenses) {
    rows.push({ id: expense.id, title: expense.title, type: "Expense", status: expense.status, module: "toolkit", href: `${base}/expenses/${expense.id}` });
  }
  for (const issue of snapshot.issues) {
    rows.push({ id: issue.id, title: issue.title, type: "Issue", status: issue.status, module: "toolkit", href: `${base}/issues/${issue.id}` });
  }
  for (const poll of snapshot.polls) {
    const pollStatus: WorkflowStatus = poll.status === "closed" ? "completed" : "in-progress";
    rows.push({ id: poll.id, title: poll.title, type: "Poll", status: pollStatus, module: "toolkit", href: `${base}/feedback/${poll.id}` });
  }
  for (const form of snapshot.forms) {
    rows.push({ id: form.id, title: form.name, type: "Form", status: "approved", module: "toolkit", href: `${base}/forms/${form.id}` });
  }
  for (const appt of snapshot.appointments) {
    rows.push({ id: appt.id, title: appt.title, type: "Appointment", status: "in-progress", module: "toolkit", href: `${base}/appointments/${appt.id}` });
  }
  for (const person of snapshot.directory) {
    rows.push({ id: person.id, title: person.name, type: "Contact", status: "approved", module: "toolkit", href: `${base}/directory/${person.id}` });
  }
  for (const item of snapshot.inventory) {
    rows.push({ id: item.id, title: item.name, type: "Inventory", status: "approved", module: "toolkit", href: `${base}/inventory/${item.id}` });
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
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 16px 60px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--ch-text)" }}>Records</h1>
        <Link
          href={`/w/${params.workspaceSlug}/chat`}
          style={{ fontSize: "0.82rem", color: "var(--ch-muted)", textDecoration: "none" }}
        >
          ← Back to chat
        </Link>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {MODULE_FILTER_LABELS.filter((item) =>
          item.key === "all" || snapshot.workspace.modules.includes(item.key as ModuleKey)
        ).map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            type="button"
            style={{
              padding: "5px 14px",
              borderRadius: 20,
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
        <div style={{ padding: "24px 16px", textAlign: "center", border: "1px solid var(--ch-border)", borderRadius: 12, color: "var(--ch-muted)", fontSize: "0.875rem" }}>
          Nothing created yet.{" "}
          <Link href={`/w/${params.workspaceSlug}/chat`} style={{ color: "var(--ch-accent)" }}>
            Go to chat to get started.
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--ch-border)", borderRadius: 12, overflow: "hidden", background: "var(--ch-surface)" }}>
          {filtered.map((row, i) => (
            <Link
              key={row.id}
              href={row.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 16px",
                borderBottom: i < filtered.length - 1 ? "1px solid var(--ch-border)" : "none",
                textDecoration: "none",
                minHeight: 56,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--ch-text)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.title}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--ch-muted)", marginTop: 2 }}>
                  {row.type} · {row.module}
                </div>
              </div>
              <StatusPill status={row.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
