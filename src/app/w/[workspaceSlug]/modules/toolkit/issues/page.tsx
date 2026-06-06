"use client";

import { useMemo, useState } from "react";

import { useAppState } from "@/components/providers/app-state-provider";
import { Badge, DataTable, EmptyState, PageHeader, Select, Toolbar, statusLabel, statusTone } from "@/components/ui";
import { IssueCreateModal } from "@/components/forms/IssueCreateModal";
import type { Column } from "@/components/ui";
import { downloadCsv } from "@/lib/services/csv-export";
import type { IssueReport } from "@/lib/types";

const sevTone = (s: string) => (s === "high" ? "danger" : s === "medium" ? "warning" : "neutral") as "danger" | "warning" | "neutral";

export default function ToolkitIssuesPage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;
  const [showCreate, setShowCreate] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  const allIssues = useMemo(() => [...snapshot.issues].sort((a, b) => { const o = ["high","medium","low"]; return o.indexOf(a.severity) - o.indexOf(b.severity); }), [snapshot.issues]);
  const filtered = useMemo(() => {
    let rows = allIssues;
    if (search.trim()) { const q = search.toLowerCase(); rows = rows.filter((i) => i.title.toLowerCase().includes(q) || i.area.toLowerCase().includes(q) || i.reportedBy.toLowerCase().includes(q)); }
    if (statusFilter !== "all") rows = rows.filter((i) => i.status === statusFilter);
    if (severityFilter !== "all") rows = rows.filter((i) => i.severity === severityFilter);
    return rows;
  }, [allIssues, search, statusFilter, severityFilter]);

  const total = allIssues.length;
  const openCount = allIssues.filter((i) => i.status !== "completed" && i.status !== "approved").length;

  const columns: Column<IssueReport>[] = [
    { key: "title", header: "Title", render: (i) => <span style={{ fontWeight: 550, color: "var(--ds-ink)" }}>{i.title}</span> },
    { key: "area", header: "Area", width: "140px", render: (i) => i.area },
    { key: "reportedBy", header: "Reported by", width: "130px", render: (i) => i.reportedBy },
    { key: "severity", header: "Severity", width: "100px", render: (i) => <Badge tone={sevTone(i.severity)}>{i.severity}</Badge> },
    { key: "status", header: "Status", width: "110px", render: (i) => <Badge tone={statusTone(i.status)}>{statusLabel(i.status)}</Badge> },
  ];

  function handleExport() { downloadCsv("toolkit-issues.csv", filtered, [{ header: "Title", value: (i: IssueReport) => i.title }, { header: "Area", value: (i: IssueReport) => i.area }, { header: "Severity", value: (i: IssueReport) => i.severity }, { header: "Status", value: (i: IssueReport) => i.status }, { header: "Reported by", value: (i: IssueReport) => i.reportedBy }]); }

  const stOpts = [{value:"all",label:"All statuses"},{value:"pending",label:"Pending"},{value:"in-progress",label:"In progress"},{value:"completed",label:"Completed"},{value:"flagged",label:"Flagged"}];
  const sevOpts = [{value:"all",label:"All severities"},{value:"high",label:"High"},{value:"medium",label:"Medium"},{value:"low",label:"Low"}];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <PageHeader title="Issues" meta={`${total} issues · ${openCount} open`} actions={<><button className="button button--ghost" disabled={!filtered.length} onClick={handleExport} type="button">Export CSV</button><button className="button button--primary" onClick={() => setShowCreate(true)} type="button">+ Report issue</button></>} />
      <Toolbar search={{ value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search issues..." }} filters={<><Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={stOpts} /><Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} options={sevOpts} /></>} />
      <DataTable columns={columns} rows={filtered} getRowKey={(i) => i.id} empty={<EmptyState title="No issues reported" hint="Report one with + Report issue" action={<button className="button button--primary" onClick={() => setShowCreate(true)} type="button">+ Report issue</button>} />} />
      <IssueCreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}