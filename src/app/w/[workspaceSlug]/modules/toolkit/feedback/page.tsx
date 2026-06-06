"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { Badge, DataTable, EmptyState, PageHeader, Select, Toolbar } from "@/components/ui";
import type { Column } from "@/components/ui";
import { PollCreateModal } from "@/components/forms/PollCreateModal";
import type { FeedbackPoll } from "@/lib/types";

export default function ToolkitFeedbackPage() {
  const { snapshot } = useAppState();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [search, setSearch] = useState("");
  const [laneFilter, setLaneFilter] = useState("all");

  const allPolls = useMemo(() => snapshot.polls as FeedbackPoll[], [snapshot.polls]);
  const filtered = useMemo(() => {
    let rows = allPolls;
    if (search.trim()) { const q = search.toLowerCase(); rows = rows.filter((p) => p.title.toLowerCase().includes(q) || p.owner.toLowerCase().includes(q)); }
    if (laneFilter !== "all") rows = rows.filter((p) => p.lane === laneFilter);
    return rows;
  }, [allPolls, search, laneFilter]);

  const total = allPolls.length;
  const activeCount = allPolls.filter((p) => p.status === "active").length;

  const columns: Column<FeedbackPoll>[] = [
    { key: "title", header: "Title", render: (p) => <span style={{ fontWeight: 550, color: "var(--ds-ink)" }}>{p.title}</span> },
    { key: "lane", header: "Lane", width: "100px", render: (p) => <Badge tone={p.lane === "approval" ? "warning" : p.lane === "guest" ? "info" : "neutral"}>{p.lane}</Badge> },
    { key: "audience", header: "Audience", width: "130px", render: (p) => p.audience },
    { key: "responses", header: "Responses", align: "right", width: "90px", render: (p) => `${p.responseCount ?? 0}/${p.targetCount ?? 0}` },
    { key: "status", header: "Status", width: "90px", render: (p) => p.status === "active" ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Closed</Badge> },
  ];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <PageHeader title="Polls &amp; Feedback" meta={`${total} polls · ${activeCount} active`} actions={<button className="button button--primary" onClick={() => setShowCreate(true)} type="button">+ Create poll</button>} />
      <Toolbar search={{ value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search polls..." }} filters={<Select value={laneFilter} onChange={(e) => setLaneFilter(e.target.value)} options={[{value:"all",label:"All lanes"},{value:"pulse",label:"Pulse"},{value:"approval",label:"Approval"},{value:"guest",label:"Guest"}]} />} />
      <DataTable columns={columns} rows={filtered} getRowKey={(p) => p.id} onRowClick={(p) => router.push(`${base}/feedback/${p.id}`)} empty={<EmptyState title="No polls yet" hint="Create one with + Create poll" action={<button className="button button--primary" onClick={() => setShowCreate(true)} type="button">+ Create poll</button>} />} />
      <PollCreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}