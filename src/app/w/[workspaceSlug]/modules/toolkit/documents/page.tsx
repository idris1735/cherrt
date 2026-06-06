"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { Badge, DataTable, EmptyState, PageHeader, Select, Toolbar, statusTone } from "@/components/ui";
import type { Column } from "@/components/ui";
import { DocumentCreateModal } from "@/components/forms/DocumentCreateModal";
import { formatCurrency } from "@/lib/format";
import type { SmartDocument } from "@/lib/types";

export default function ToolkitDocumentsPage() {
  const { snapshot } = useAppState();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const allDocs = useMemo(() => snapshot.documents, [snapshot.documents]);
  const filtered = useMemo(() => {
    let rows = allDocs;
    if (search.trim()) { const q = search.toLowerCase(); rows = rows.filter((d) => d.title.toLowerCase().includes(q) || d.preparedBy.toLowerCase().includes(q)); }
    if (typeFilter !== "all") rows = rows.filter((d) => d.type === typeFilter);
    if (statusFilter !== "all") rows = rows.filter((d) => d.status === statusFilter);
    return rows;
  }, [allDocs, search, typeFilter, statusFilter]);

  const total = allDocs.length;

  function docBadge(d: SmartDocument) {
    if (d.awaitingSignatureFrom) return <Badge tone="warning">Awaiting signature</Badge>;
    return <Badge tone={statusTone(d.status)}>{d.status}</Badge>;
  }

  const columns: Column<SmartDocument>[] = [
    { key: "title", header: "Title", render: (d) => <span style={{ fontWeight: 550, color: "var(--ds-ink)" }}>{d.title}</span> },
    { key: "type", header: "Type", width: "80px", render: (d) => d.type },
    { key: "preparedBy", header: "Prepared by", width: "130px", render: (d) => d.preparedBy },
    { key: "amount", header: "Amount", align: "right", width: "110px", render: (d) => d.amount ? formatCurrency(d.amount, snapshot.workspace.currency) : "\u2014" },
    { key: "status", header: "Status", width: "160px", render: (d) => docBadge(d) },
  ];

  const typeOpts = [{value:"all",label:"All types"},{value:"letter",label:"Letter"},{value:"invoice",label:"Invoice"},{value:"memo",label:"Memo"}];
  const statusOpts = [{value:"all",label:"All statuses"},{value:"draft",label:"Draft"},{value:"pending",label:"Pending"},{value:"approved",label:"Approved"},{value:"completed",label:"Completed"}];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <PageHeader title="Documents" meta={`${total} documents`} actions={<button className="button button--primary" onClick={() => setShowCreate(true)} type="button">+ New document</button>} />
      <Toolbar search={{ value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search documents..." }} filters={<><Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} options={typeOpts} /><Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={statusOpts} /></>} />
      <DataTable columns={columns} rows={filtered} getRowKey={(d) => d.id} onRowClick={(d) => router.push(`${base}/documents/${d.id}`)} empty={<EmptyState title="No documents yet" hint="Draft one with + New document" action={<button className="button button--primary" onClick={() => setShowCreate(true)} type="button">+ New document</button>} />} />
      <DocumentCreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}