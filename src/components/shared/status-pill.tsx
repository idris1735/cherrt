import clsx from "clsx";

import type { WorkflowStatus } from "@/lib/types";

export function StatusPill({ status }: { status: WorkflowStatus | "paid" | "opened" | "generated" | "checked-in" | "issued" }) {
  return <span className={clsx("status-pill", `status-pill--${status}`)}>{status.replace("-", " ")}</span>;
}
