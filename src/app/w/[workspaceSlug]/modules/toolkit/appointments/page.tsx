"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { DataTable, EmptyState, PageHeader, Toolbar } from "@/components/ui";
import type { Column } from "@/components/ui";
import { AppointmentCreateModal } from "@/components/forms/AppointmentCreateModal";
import type { Appointment } from "@/lib/types";

export default function ToolkitAppointmentsPage() {
  const { snapshot } = useAppState();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [search, setSearch] = useState("");
  const allAppts = useMemo(() => snapshot.appointments, [snapshot.appointments]);
  const filtered = useMemo(() => {
    let rows = allAppts;
    if (search.trim()) { const q = search.toLowerCase(); rows = rows.filter((a) => a.title.toLowerCase().includes(q) || a.owner.toLowerCase().includes(q)); }
    return rows;
  }, [allAppts, search]);

  const total = allAppts.length;

  const columns: Column<Appointment>[] = [
    { key: "title", header: "Title", render: (a) => <span style={{ fontWeight: 550, color: "var(--ds-ink)" }}>{a.title}</span> },
    { key: "when", header: "When", width: "160px", render: (a) => a.when },
    { key: "owner", header: "Owner", width: "130px", render: (a) => a.owner },
  ];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <PageHeader title="Appointments" meta={`${total} appointments`} actions={<button className="button button--primary" onClick={() => setShowCreate(true)} type="button">+ Schedule</button>} />
      <Toolbar search={{ value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search appointments..." }} />
      <DataTable columns={columns} rows={filtered} getRowKey={(a) => a.id} onRowClick={(a) => router.push(`${base}/appointments/${a.id}`)} empty={<EmptyState title="No appointments yet" hint="Schedule one with + Schedule" action={<button className="button button--primary" onClick={() => setShowCreate(true)} type="button">+ Schedule</button>} />} />
      <AppointmentCreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}