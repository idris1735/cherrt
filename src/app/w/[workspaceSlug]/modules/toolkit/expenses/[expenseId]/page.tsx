"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { FileUpload } from "@/components/shared/file-upload";
import { formatCurrency } from "@/lib/format";

export default function ToolkitExpenseDetailPage() {
  const params = useParams<{ expenseId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;
  const base = `/w/${params.workspaceSlug}/modules/toolkit`;

  const expense = snapshot.expenses.find((e) => e.id === params.expenseId);
  const [attachments, setAttachments] = useState<string[]>(expense?.attachments ?? []);

  if (!expense) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={`${base}/expenses`}>← Expenses</Link>
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
          <Link className="tk-inline-link" href={`${base}/expenses`}>← Expenses</Link>
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

        <FileUpload
          workspaceId={snapshot.workspace.id}
          recordType="expenses"
          recordId={expense.id}
          attachments={attachments}
          onAttached={(url) => setAttachments((prev) => [...prev, url])}
          accept="image/*,application/pdf"
          label="Attach receipt"
        />

        <div className="tk-card__actions" style={{ marginTop: 20 }}>
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
