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
