"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import type { ModuleKey, WorkspaceSnapshot } from "@/lib/types";

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
