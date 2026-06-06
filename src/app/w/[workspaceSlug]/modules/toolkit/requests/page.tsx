"use client";

import { useMemo, useState } from "react";
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
import { RequestCreateModal } from "@/components/forms/RequestCreateModal";
import { formatCurrency } from "@/lib/format";
import type { WorkflowRequest } from "@/lib/types";

export default function ToolkitRequestsPage() {
  const { snapshot } = useAppState();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const allRequests = useMemo(
    () =>
      snapshot.requests
        .filter((r) => r.module === "toolkit")
        .sort((a, b) => {
          const order = ["pending", "flagged", "in-progress", "approved", "completed"];
          return order.indexOf(a.status) - order.indexOf(b.status);
        }),
    [snapshot.requests],
  );

  const filtered = useMemo(() => {
    let rows = allRequests;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          r.requester.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    return rows;
  }, [allRequests, search, statusFilter]);

  const pending = allRequests.filter((r) => r.status === "pending").length;
  const flagged = allRequests.filter((r) => r.status === "flagged").length;

  const meta = `${allRequests.length} total · ${pending} pending${flagged > 0 ? ` · ${flagged} flagged` : ""}`;

  const columns: Column<WorkflowRequest>[] = [
    {
      key: "title",
      header: "Request",
      render: (r) => (
        <span style={{ fontWeight: 550, color: "var(--ds-ink)" }}>{r.title}</span>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: "120px",
      render: (r) => r.type,
    },
    {
      key: "requester",
      header: "Requester",
      width: "140px",
      render: (r) => r.requester,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      width: "110px",
      render: (r) =>
        r.amount ? formatCurrency(r.amount, snapshot.workspace.currency) : "—",
    },
    {
      key: "status",
      header: "Status",
      width: "110px",
      render: (r) => <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>,
    },
    {
      key: "created",
      header: "Raised",
      width: "100px",
      render: (r) => r.createdAtLabel,
    },
  ];

  const statusOptions = [
    { value: "all", label: "All statuses" },
    { value: "pending", label: "Pending" },
    { value: "in-progress", label: "In progress" },
    { value: "approved", label: "Approved" },
    { value: "completed", label: "Completed" },
    { value: "flagged", label: "Flagged" },
  ];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <PageHeader
        title="Requests"
        meta={meta}
        actions={
          <>
            <button className="button button--primary" onClick={() => setShowCreate(true)} type="button">
              + New request
            </button>
          </>
        }
      />

      <Toolbar
        search={{
          value: search,
          onChange: (e) => setSearch(e.target.value),
          placeholder: "Search requests...",
        }}
        filters={
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={statusOptions}
          />
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(r) => r.id}
        onRowClick={(r) => router.push(`${base}/requests/${r.id}`)}
        empty={
          <EmptyState
            title="No requests yet"
            hint="Create one with + New request"
            action={
              <button className="button button--primary" onClick={() => setShowCreate(true)} type="button">
                + New request
              </button>
            }
          />
        }
      />
      <RequestCreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
