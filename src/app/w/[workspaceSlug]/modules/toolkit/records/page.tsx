"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import { Badge, DataTable, EmptyState, PageHeader, Toolbar } from "@/components/ui";
import type { Column } from "@/components/ui";

type RecordRow = { id: string; kind: string; title: string; statusOrMeta: string; meta: string; badgeTone?: "neutral" | "success" | "warning" | "danger" | "info" };

export default function ToolkitRecordsPage() {
  const { snapshot } = useAppState();

  const [search, setSearch] = useState("");

  const allRecords = useMemo((): RecordRow[] => {
    const rows: RecordRow[] = [];
    snapshot.requests.filter((r) => r.module === "toolkit").forEach((r) => rows.push({ id: r.id, kind: "Request", title: r.title, statusOrMeta: r.status, meta: r.createdAtLabel || "", badgeTone: r.status === "pending" ? "warning" : r.status === "approved" || r.status === "completed" ? "success" : r.status === "flagged" ? "danger" : "neutral" }));
    snapshot.documents.forEach((d) => rows.push({ id: d.id, kind: "Document", title: d.title, statusOrMeta: d.type, meta: d.createdAtLabel || "" }));
    snapshot.expenses.forEach((e) => rows.push({ id: e.id, kind: "Expense", title: e.title, statusOrMeta: e.status, meta: "" }));
    snapshot.issues.forEach((i) => rows.push({ id: i.id, kind: "Issue", title: i.title, statusOrMeta: i.severity, meta: "" }));
    snapshot.inventory.forEach((inv) => rows.push({ id: inv.id, kind: "Inventory", title: inv.name, statusOrMeta: inv.inStock + " in stock", meta: "" }));
    snapshot.polls.forEach((p) => rows.push({ id: p.id, kind: "Poll", title: p.title, statusOrMeta: p.lane, meta: "" }));
    return rows;
  }, [snapshot]);

  const filtered = useMemo(() => {
    let rows = allRecords;
    if (search.trim()) { const q = search.toLowerCase(); rows = rows.filter((r) => r.title.toLowerCase().includes(q) || r.kind.toLowerCase().includes(q)); }
    return rows;
  }, [allRecords, search]);

  const columns: Column<RecordRow>[] = [
    { key: "kind", header: "Type", width: "100px", render: (r) => <Badge tone={r.kind === "Request" ? "warning" : r.kind === "Issue" ? "danger" : r.kind === "Expense" ? "info" : "neutral"}>{r.kind}</Badge> },
    { key: "title", header: "Title / Name", render: (r) => <span style={{ fontWeight: 550, color: "var(--ds-ink)" }}>{r.title}</span> },
    { key: "meta", header: "Status / Meta", width: "140px", render: (r) => r.badgeTone ? <Badge tone={r.badgeTone}>{r.statusOrMeta}</Badge> : r.statusOrMeta },
    { key: "created", header: "Created", width: "100px", render: (r) => r.meta || "\u2014" },
  ];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <PageHeader title="Records" meta={`${allRecords.length} records across all modules`} />
      <Toolbar search={{ value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search all records..." }} />
      <DataTable columns={columns} rows={filtered} getRowKey={(r) => r.id} empty={<EmptyState title="No records yet" hint="Create items via chat or module pages" />} />
    </div>
  );
}