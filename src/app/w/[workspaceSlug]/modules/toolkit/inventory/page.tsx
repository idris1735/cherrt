"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { Badge, DataTable, EmptyState, PageHeader, Select, Toolbar } from "@/components/ui";
import { InventoryCreateModal } from "@/components/forms/InventoryCreateModal";
import type { Column } from "@/components/ui";
import type { InventoryItem } from "@/lib/types";

export default function ToolkitInventoryPage() {
  const { snapshot } = useAppState();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const allItems = useMemo(() => snapshot.inventory, [snapshot.inventory]);

  const filtered = useMemo(() => {
    let rows = allItems;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((i) => i.name.toLowerCase().includes(q) || i.location.toLowerCase().includes(q));
    }
    if (stockFilter === "low") rows = rows.filter((i) => i.inStock <= i.minLevel);
    return rows;
  }, [allItems, search, stockFilter]);

  const total = allItems.length;
  const lowCount = allItems.filter((i) => i.inStock <= i.minLevel).length;

  const columns: Column<InventoryItem>[] = [
    { key: "name", header: "Item", render: (i) => <span style={{ fontWeight: 550, color: "var(--ds-ink)" }}>{i.name}</span> },
    { key: "location", header: "Location", width: "140px", render: (i) => i.location },
    { key: "inStock", header: "In stock", align: "right", width: "90px", render: (i) => i.inStock },
    { key: "minLevel", header: "Min level", align: "right", width: "90px", render: (i) => i.minLevel },
    { key: "status", header: "Status", width: "80px", render: (i) => i.inStock <= i.minLevel ? <Badge tone="danger">Low</Badge> : <Badge tone="success">OK</Badge> },
  ];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <PageHeader
        title="Inventory"
        meta={`${total} items · ${lowCount} low`}
        actions={<button className="button button--primary" onClick={() => setShowCreate(true)} type="button">+ Add item</button>}
      />
      <Toolbar
        search={{ value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search inventory..." }}
        filters={<Select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} options={[{ value: "all", label: "All items" }, { value: "low", label: "Low stock" }]} />}
      />
      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(i) => i.id}
        onRowClick={(i) => router.push(`${base}/inventory/${i.id}`)}
        empty={<EmptyState title="No inventory items yet" hint="Add one with + Add item" action={<button className="button button--primary" onClick={() => setShowCreate(true)} type="button">+ Add item</button>} />}
      />
      <InventoryCreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}