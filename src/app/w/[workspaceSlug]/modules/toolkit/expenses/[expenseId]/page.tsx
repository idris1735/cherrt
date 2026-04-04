"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { StatusPill } from "@/components/shared/status-pill";
import { formatCurrency } from "@/lib/format";
import type { ExpenseEntry } from "@/lib/types";

function buildReceiptItems(expense: ExpenseEntry) {
  const baseTitle = expense.title.toLowerCase().includes("fuel")
    ? "Fuel station receipt"
    : expense.title.toLowerCase().includes("toner")
      ? "Vendor receipt"
      : "Expense receipt";

  return Array.from({ length: expense.receiptCount }, (_, index) => ({
    id: `${expense.id}-receipt-${index + 1}`,
    title: `${baseTitle} ${index + 1}`,
    note: index === 0 ? "Primary evidence uploaded for accounts handoff." : "Supporting receipt kept with this entry.",
    status: index === 0 ? "Verified" : "Attached",
  }));
}

function expenseTheme(status: string) {
  if (status === "flagged") return { accent: "#c0432a", tint: "#fff0ea", label: "Needs review" };
  if (status === "pending") return { accent: "#d85e2f", tint: "#fff2ea", label: "Awaiting approval" };
  if (status === "approved") return { accent: "#2f6f82", tint: "#edf7fa", label: "Approved" };
  return { accent: "#267a4f", tint: "#eef7f0", label: "Completed" };
}

export default function ToolkitExpenseDetailPage() {
  const params = useParams<{ expenseId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const base = `/w/${params.workspaceSlug}/modules/toolkit`;

  const expense = snapshot.expenses.find((entry) => entry.id === params.expenseId);

  if (!expense) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Expense detail</p>
              <h2 className="tk-card-title">Expense not found</h2>
            </div>
            <Link className="tk-inline-link" href={`${base}/expenses`}>
              Back to expenses
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const theme = expenseTheme(expense.status);
  const receiptItems = buildReceiptItems(expense);

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Expense detail</p>
          <h1 className="tk-page-title">{expense.title}</h1>
          <p className="tk-page-desc">
            Petty cash evidence, department handoff, and the approval state for this expense.
          </p>
        </div>
        <Link className="tk-inline-link" href={`${base}/expenses`}>
          Back to expenses
        </Link>
      </div>

      <div
        className="tk-detail-hero"
        style={
          {
            "--tk-detail-accent": theme.accent,
            "--tk-detail-tint": theme.tint,
          } as CSSProperties
        }
      >
        <div className="tk-detail-hero__media">
          <span className="tk-detail-hero__badge">{theme.label}</span>
          <div className="tk-detail-hero__value">{formatCurrency(expense.amount, snapshot.workspace.currency)}</div>
        </div>
        <div className="tk-detail-hero__content">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Expense summary</p>
              <h2 className="tk-card-title">{expense.title}</h2>
            </div>
            <StatusPill status={expense.status} />
          </div>

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
              <span>Receipts</span>
              <strong>{expense.receiptCount}</strong>
            </div>
            <div className="tk-detail-stat">
              <span>Status</span>
              <strong>{expense.status}</strong>
            </div>
          </div>

          <p className="tk-detail-hero__note">
            Keep the evidence trail clean so accounts can export, reconcile, and close the spend without extra back-and-forth.
          </p>

          <div className="tk-card__actions">
            <Link className="button button--primary" href={`/w/${params.workspaceSlug}/chat`}>
              Attach more evidence
            </Link>
            <Link className="button button--ghost" href={`${base}/requests`}>
              Open approval queue
            </Link>
          </div>
        </div>
      </div>

      <div className="tk-layout-2 tk-layout-2--balanced">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Receipt evidence</p>
              <h2 className="tk-card-title">What accounts will review</h2>
            </div>
          </div>

          <div className="tk-mini-stack">
            {receiptItems.length ? (
              receiptItems.map((receipt) => (
                <div className="tk-soft-tile" key={receipt.id}>
                  <strong>{receipt.title}</strong>
                  <p>{receipt.note}</p>
                  <span className="tk-inline-link" style={{ minHeight: "auto", padding: 0 }}>
                    {receipt.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="tk-soft-tile">
                <strong>No receipt evidence yet</strong>
                <p>Ask Chertt to add the receipt image and keep the approval trail complete.</p>
              </div>
            )}
          </div>
        </div>

        <div className="tk-side-stack">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Accounts handoff</p>
                <h2 className="tk-card-title">Export-ready fields</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <div className="tk-soft-line">Expense title and department</div>
              <div className="tk-soft-line">Amount and receipt evidence count</div>
              <div className="tk-soft-line">Approval state for this cash movement</div>
              <div className="tk-soft-line">Prepared for spreadsheet handoff to accounts</div>
            </div>
          </div>

          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Next actions</p>
                <h2 className="tk-card-title">Move this expense forward</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <Link className="tk-soft-tile tk-soft-tile--link" href={`/w/${params.workspaceSlug}/chat`}>
                <strong>Add receipt image</strong>
                <p>Tell Chertt to attach a receipt image or supporting evidence to this expense.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`/w/${params.workspaceSlug}/chat`}>
                <strong>Clarify the description</strong>
                <p>Update what the spend was for so accounts and approvers have clean context.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/expenses`}>
                <strong>Back to the ledger</strong>
                <p>Return to the full petty cash list and review the other entries.</p>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

