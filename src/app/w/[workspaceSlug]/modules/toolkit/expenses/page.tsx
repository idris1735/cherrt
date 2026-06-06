"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import {
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
  Select,
  Toolbar,
  statusLabel,
  statusTone,
} from "@/components/ui";
import type { Column } from "@/components/ui";
import { ExpenseCreateModal } from "@/components/forms/ExpenseCreateModal";
import { formatCurrency } from "@/lib/format";
import { downloadCsv } from "@/lib/services/csv-export";
import type { ExpenseEntry } from "@/lib/types";

export default function ToolkitExpensesPage() {
  const { snapshot } = useAppState();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const allExpenses = useMemo(() => snapshot.expenses, [snapshot.expenses]);

  const filtered = useMemo(() => {
    let rows = allExpenses;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((e) => e.title.toLowerCase().includes(q) || e.department.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") rows = rows.filter((e) => e.status === statusFilter);
    return rows;
  }, [allExpenses, search, statusFilter]);

  const totalAmount = allExpenses.reduce((sum, e) => sum + e.amount, 0);
  const total = allExpenses.length;

  const columns: Column<ExpenseEntry>[] = [
    { key: "title", header: "Title", render: (e) => <span style={{ fontWeight: 550, color: "var(--ds-ink)" }}>{e.title}</span> },
    { key: "department", header: "Department", width: "140px", render: (e) => e.department },
    { key: "amount", header: "Amount", align: "right", width: "110px", render: (e) => formatCurrency(e.amount, snapshot.workspace.currency) },
    { key: "receipts", header: "Receipts", align: "right", width: "80px", render: (e) => e.receiptCount ?? 0 },
    { key: "status", header: "Status", width: "110px", render: (e) => <Badge tone={statusTone(e.status)}>{statusLabel(e.status)}</Badge> },
  ];

  const statusOptions = [
    { value: "all", label: "All statuses" },
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "completed", label: "Completed" },
    { value: "flagged", label: "Flagged" },
  ];

  function handleExport() {
    downloadCsv("toolkit-expenses.csv", filtered, [
      { header: "Title", value: (e: ExpenseEntry) => e.title },
      { header: "Department", value: (e: ExpenseEntry) => e.department },
      { header: "Amount", value: (e: ExpenseEntry) => String(e.amount) },
      { header: "Receipt count", value: (e: ExpenseEntry) => String(e.receiptCount) },
      { header: "Status", value: (e: ExpenseEntry) => e.status },
    ]);
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <PageHeader
        title="Expenses"
        meta={`${total} entries · ${formatCurrency(totalAmount, snapshot.workspace.currency)} logged`}
        actions={
          <>
            <button className="button button--ghost" disabled={!filtered.length} onClick={handleExport} type="button">Export CSV</button>
            <button className="button button--primary" onClick={() => setShowCreate(true)} type="button">+ Log expense</button>
          </>
        }
      />
      <Toolbar
        search={{ value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search expenses..." }}
        filters={<Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={statusOptions} />}
      />
      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(e) => e.id}
        onRowClick={(e) => router.push(`${base}/expenses/${e.id}`)}
        empty={<EmptyState title="No expenses yet" hint="Log one with + Log expense" action={<button className="button button--primary" onClick={() => setShowCreate(true)} type="button">+ Log expense</button>} />}
      />
      <ExpenseCreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}