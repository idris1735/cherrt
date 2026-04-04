"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import { StatusPill } from "@/components/shared/status-pill";
import { formatCurrency } from "@/lib/format";
import type { ExpenseEntry } from "@/lib/types";

function expenseTheme(expense: ExpenseEntry) {
  if (expense.status === "flagged") return { accent: "#c0432a", tint: "#fff0ea", label: "Needs review" };
  if (expense.status === "pending") return { accent: "#d85e2f", tint: "#fff2ea", label: "Awaiting approval" };
  if (expense.status === "approved") return { accent: "#2f6f82", tint: "#edf7fa", label: "Approved" };
  return { accent: "#267a4f", tint: "#eef7f0", label: "Completed" };
}

export default function ToolkitExpensesPage() {
  const { snapshot, approveRequest } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [selected, setSelected] = useState<ExpenseEntry | null>(null);

  const expenses = snapshot.expenses;
  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const pendingCount = expenses.filter((e) => e.status === "pending").length;
  const approvedCount = expenses.filter((e) => e.status === "approved").length;
  const flaggedCount = expenses.filter((e) => e.status === "flagged").length;

  const deptMap = new Map<string, number>();
  for (const e of expenses) {
    deptMap.set(e.department, (deptMap.get(e.department) ?? 0) + e.amount);
  }
  const deptTotals = [...deptMap.entries()].sort((a, b) => b[1] - a[1]);
  const maxDept = deptTotals[0]?.[1] ?? 1;

  // Find the matching request for approval
  const relatedRequest = selected
    ? snapshot.requests.find((r) => r.title.toLowerCase().includes(selected.title.toLowerCase().split(" ").slice(0, 2).join(" ")) && r.module === "toolkit")
    : null;

  return (
    <>
      <div className="tk-page">
        <div className="tk-page-head">
          <div className="tk-page-head__copy">
            <p className="tk-eyebrow">Petty cash and expenses</p>
            <h1 className="tk-page-title">Expense ledger</h1>
            <p className="tk-page-desc">
              {formatCurrency(totalAmount, snapshot.workspace.currency)} logged.
              {pendingCount > 0 ? ` ${pendingCount} awaiting approval.` : ""}
            </p>
          </div>
          <Link className="button button--primary" href={`/w/${snapshot.workspace.slug}/chat`}>
            Log expense
          </Link>
        </div>

        <div className="tk-requests-summary">
          <div className="tk-requests-summary__item">
            <span>Total logged</span>
            <strong>{formatCurrency(totalAmount, snapshot.workspace.currency)}</strong>
          </div>
          <div className={`tk-requests-summary__item${pendingCount > 0 ? " tk-requests-summary__item--flagged" : ""}`}>
            <span>Pending</span>
            <strong>{pendingCount}</strong>
          </div>
          <div className="tk-requests-summary__item">
            <span>Approved</span>
            <strong>{approvedCount}</strong>
          </div>
          {flaggedCount > 0 ? (
            <div className="tk-requests-summary__item tk-requests-summary__item--flagged">
              <span>Flagged</span>
              <strong>{flaggedCount}</strong>
            </div>
          ) : null}
        </div>

        <div className="tk-layout-2 tk-layout-2--balanced">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Entries</p>
                <h2 className="tk-card-title">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</h2>
              </div>
              {pendingCount > 0 ? <span className="tk-badge tk-badge--medium">{pendingCount} pending</span> : null}
            </div>

            <div className="tk-expense-grid">
              {expenses.length ? (
                expenses.map((expense) => {
                  const theme = expenseTheme(expense);
                  return (
                    <button
                      className="tk-expense-card"
                      key={expense.id}
                      onClick={() => setSelected(expense)}
                      style={{ "--tk-expense-accent": theme.accent, "--tk-expense-tint": theme.tint } as CSSProperties}
                      type="button"
                    >
                      <div className="tk-expense-card__media">
                        <span className="tk-expense-card__label">{theme.label}</span>
                        <div className="tk-expense-card__amount">{formatCurrency(expense.amount, snapshot.workspace.currency)}</div>
                      </div>

                      <div className="tk-expense-card__body">
                        <div className="tk-expense-card__head">
                          <div>
                            <strong>{expense.title}</strong>
                            <p>{expense.department}</p>
                          </div>
                          <StatusPill status={expense.status} />
                        </div>

                        <div className="tk-expense-card__stats">
                          <div className="tk-expense-card__stat">
                            <span>Department</span>
                            <strong>{expense.department}</strong>
                          </div>
                          <div className="tk-expense-card__stat">
                            <span>Receipts</span>
                            <strong>{expense.receiptCount}</strong>
                          </div>
                        </div>

                        <div className="tk-expense-card__footer">
                          <span className="tk-expense-card__hint">Tap to review and take action</span>
                          <span className="tk-inline-link" style={{ minHeight: "auto", padding: "0 10px", fontSize: "0.74rem" }}>View →</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="tk-soft-tile">
                  <strong>No expenses yet</strong>
                  <p>Log the first expense in chat and Chertt will route it for approval.</p>
                </div>
              )}
            </div>
          </div>

          <div className="tk-side-stack">
            {deptTotals.length > 0 ? (
              <div className="tk-card">
                <div className="tk-card-head">
                  <div className="tk-card-head__copy">
                    <p className="tk-eyebrow">Breakdown</p>
                    <h2 className="tk-card-title">By department</h2>
                  </div>
                </div>
                <div className="tk-dept-bars">
                  {deptTotals.map(([dept, amount]) => (
                    <div className="tk-dept-bar" key={dept}>
                      <div className="tk-dept-bar__head">
                        <span>{dept}</span>
                        <strong>{formatCurrency(amount, snapshot.workspace.currency)}</strong>
                      </div>
                      <div className="tk-dept-bar__track">
                        <div className="tk-dept-bar__fill" style={{ width: `${Math.round((amount / maxDept) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="tk-card">
              <div className="tk-card-head">
                <div className="tk-card-head__copy">
                  <p className="tk-eyebrow">Accounts handoff</p>
                  <h2 className="tk-card-title">Export fields</h2>
                </div>
              </div>
              <div className="tk-mini-stack">
                <div className="tk-soft-line">Expense title and category</div>
                <div className="tk-soft-line">Department or owning unit</div>
                <div className="tk-soft-line">Amount and receipt evidence count</div>
                <div className="tk-soft-line">Approval status and timestamps</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selected ? (
        <div className="tk-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="tk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tk-modal__head">
              <div>
                <div className="tk-modal__title">{selected.title}</div>
                <div className="tk-modal__subtitle">{selected.department} — {selected.receiptCount} receipt{selected.receiptCount !== 1 ? "s" : ""}</div>
              </div>
              <button className="tk-modal__close" onClick={() => setSelected(null)} type="button" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="tk-modal__body">
              <div className="tk-modal__stat-row">
                <div className="tk-modal__stat">
                  <span>Amount</span>
                  <strong>{formatCurrency(selected.amount, snapshot.workspace.currency)}</strong>
                </div>
                <div className="tk-modal__stat">
                  <span>Status</span>
                  <strong><StatusPill status={selected.status} /></strong>
                </div>
                <div className="tk-modal__stat">
                  <span>Receipts</span>
                  <strong>{selected.receiptCount}</strong>
                </div>
                <div className="tk-modal__stat">
                  <span>Department</span>
                  <strong>{selected.department}</strong>
                </div>
              </div>
            </div>
            <div className="tk-modal__actions">
              {relatedRequest?.status === "pending" ? (
                <button
                  className="button button--primary"
                  onClick={() => { approveRequest(relatedRequest.id); setSelected(null); }}
                  type="button"
                >
                  Approve
                </button>
              ) : null}
              <Link className="button button--ghost" href={`${base}/requests`} onClick={() => setSelected(null)}>
                View request
              </Link>
              <Link className="tk-inline-link" href={`/w/${snapshot.workspace.slug}/chat`} onClick={() => setSelected(null)}>
                Update in chat
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

