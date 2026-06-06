"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { DataTable, EmptyState, PageHeader, Toolbar } from "@/components/ui";
import type { Column } from "@/components/ui";
import { DirectoryCreateModal } from "@/components/forms/DirectoryCreateModal";
import type { Person } from "@/lib/types";

export default function ToolkitDirectoryPage() {
  const { snapshot } = useAppState();
  const router = useRouter();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const allPeople = useMemo(() => snapshot.directory, [snapshot.directory]);
  const filtered = useMemo(() => {
    let rows = allPeople;
    if (search.trim()) { const q = search.toLowerCase(); rows = rows.filter((p) => p.name.toLowerCase().includes(q) || p.title.toLowerCase().includes(q) || p.unit.toLowerCase().includes(q)); }
    return rows;
  }, [allPeople, search]);

  const total = allPeople.length;

  const columns: Column<Person>[] = [
    { key: "name", header: "Name", render: (p) => <span style={{ fontWeight: 550, color: "var(--ds-ink)" }}>{p.name}</span> },
    { key: "title", header: "Title", width: "160px", render: (p) => p.title },
    { key: "unit", header: "Unit", width: "140px", render: (p) => p.unit },
    { key: "phone", header: "Phone", width: "140px", render: (p) => p.phone ? <a href={`tel:${p.phone}`} onClick={(e) => e.stopPropagation()} style={{ color: "var(--ds-accent)", textDecoration: "none" }}>{p.phone}</a> : "\u2014" },
  ];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <PageHeader title="Directory" meta={`${total} people`} />
      <Toolbar search={{ value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search people..." }} />
      <DataTable columns={columns} rows={filtered} getRowKey={(p) => p.id} onRowClick={(p) => router.push(`${base}/directory/${p.id}`)} empty={<EmptyState title="No people yet" hint="Add staff via chat" />} />
      <DirectoryCreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}