"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { DataTable, EmptyState, PageHeader, Toolbar } from "@/components/ui";
import type { Column } from "@/components/ui";
import { FormCreateModal } from "@/components/forms/FormCreateModal";
import type { FormDefinition } from "@/lib/types";

export default function ToolkitFormsPage() {
  const { snapshot } = useAppState();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [search, setSearch] = useState("");
  const allForms = useMemo(() => snapshot.forms, [snapshot.forms]);
  const filtered = useMemo(() => {
    let rows = allForms;
    if (search.trim()) { const q = search.toLowerCase(); rows = rows.filter((f) => f.name.toLowerCase().includes(q) || f.owner.toLowerCase().includes(q)); }
    return rows;
  }, [allForms, search]);

  const total = allForms.length;

  const columns: Column<FormDefinition>[] = [
    { key: "name", header: "Name", render: (f) => <span style={{ fontWeight: 550, color: "var(--ds-ink)" }}>{f.name}</span> },
    { key: "owner", header: "Owner", width: "140px", render: (f) => f.owner },
    { key: "submissions", header: "Submissions", align: "right", width: "100px", render: (f) => f.submissions ?? 0 },
  ];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <PageHeader title="Forms" meta={`${total} forms`} actions={<button className="button button--primary" onClick={() => setShowCreate(true)} type="button">+ Create form</button>} />
      <Toolbar search={{ value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search forms..." }} />
      <DataTable columns={columns} rows={filtered} getRowKey={(f) => f.id} onRowClick={(f) => router.push(`${base}/forms/${f.id}`)} empty={<EmptyState title="No forms yet" hint="Create one with + Create form" action={<button className="button button--primary" onClick={() => setShowCreate(true)} type="button">+ Create form</button>} />} />
      <FormCreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}