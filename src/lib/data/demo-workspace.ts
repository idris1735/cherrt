import type { WorkspaceData } from "@/lib/services/business-metrics";
import type { WorkflowRequest, ExpenseEntry, IssueReport, InventoryItem, SmartDocument } from "@/lib/types";

const demoRequests: WorkflowRequest[] = [
  { id: "dm-req-1", type: "Expense", title: "Emergency diesel — 500L", description: "Generator fuel for the week", requester: "Idris", amount: 250_000, status: "pending", module: "toolkit", createdAtLabel: "2026-06-05", approvalSteps: [] },
  { id: "dm-req-2", type: "Supply", title: "Office chairs (×4)", description: "Ergonomic chairs for new staff", requester: "Amina", amount: 180_000, status: "pending", module: "toolkit", createdAtLabel: "2026-06-04", approvalSteps: [] },
  { id: "dm-req-3", type: "Maintenance", title: "Tyre replacement — truck B", description: "Worn tyres on delivery truck", requester: "Chidi", amount: 320_000, status: "approved", module: "toolkit", createdAtLabel: "2026-06-01", approvalSteps: [] },
  { id: "dm-req-4", type: "Approval", title: "AC repair — reception", description: "AC unit not cooling", requester: "Fatima", amount: 65_000, status: "completed", module: "toolkit", createdAtLabel: "2026-05-28", approvalSteps: [] },
  { id: "dm-req-5", type: "Expense", title: "New printer cartridge", description: "HP cartridge for front desk", requester: "Tunde", amount: 22_000, status: "pending", module: "toolkit", createdAtLabel: "2026-06-06", approvalSteps: [] },
];

const demoExpenses: ExpenseEntry[] = [
  { id: "dm-exp-1", title: "Diesel top-up — generator", department: "Facilities", amount: 85_000, status: "approved", receiptCount: 1, attachments: [] },
  { id: "dm-exp-2", title: "Office stationery", department: "Admin", amount: 8_500, status: "completed", receiptCount: 0, attachments: [] },
  { id: "dm-exp-3", title: "Transport — vendor visit", department: "Operations", amount: 15_000, status: "pending", receiptCount: 1, attachments: [] },
  { id: "dm-exp-4", title: "Brake pads — Hilux", department: "Fleet", amount: 120_000, status: "approved", receiptCount: 1, attachments: [] },
  { id: "dm-exp-5", title: "Staff lunch meeting", department: "Admin", amount: 28_000, status: "completed", receiptCount: 0, attachments: [] },
  { id: "dm-exp-6", title: "Generator servicing", department: "Facilities", amount: 45_000, status: "pending", receiptCount: 0, attachments: [] },
];

const demoIssues: IssueReport[] = [
  { id: "dm-iss-1", title: "Generator room water leak", area: "Facilities", severity: "high", status: "pending", reportedBy: "Idris", mediaCount: 0, attachments: [] },
  { id: "dm-iss-2", title: "Reception door hinge broken", area: "Front desk", severity: "medium", status: "in-progress", reportedBy: "Amina", mediaCount: 0, attachments: [] },
  { id: "dm-iss-3", title: "Parking light fuse blown", area: "Parking lot", severity: "low", status: "completed", reportedBy: "Chidi", mediaCount: 0, attachments: [] },
];

const demoInventory: InventoryItem[] = [
  { id: "dm-inv-1", name: "Printer paper (A4 ream)", location: "Main store", inStock: 2, minLevel: 10, reserved: 0 },
  { id: "dm-inv-2", name: "Engine oil (Total 15W40)", location: "Workshop", inStock: 48, minLevel: 20, reserved: 5 },
  { id: "dm-inv-3", name: "Brake pads (premium set)", location: "Workshop", inStock: 6, minLevel: 8, reserved: 2 },
  { id: "dm-inv-4", name: "Diesel filter", location: "Main store", inStock: 15, minLevel: 5, reserved: 0 },
  { id: "dm-inv-5", name: "Tyre (10-ply)", location: "Workshop", inStock: 4, minLevel: 10, reserved: 0 },
  { id: "dm-inv-6", name: "A/C gas canister", location: "Main store", inStock: 3, minLevel: 4, reserved: 1 },
];

const demoDocuments: SmartDocument[] = [
  { id: "dm-doc-1", title: "Fuel vendor payment extension", type: "letter", body: "Dear Sir,", status: "pending", preparedBy: "Idris", awaitingSignatureFrom: "Admin", createdAtLabel: "2026-06-05" },
  { id: "dm-doc-2", title: "Office supplies invoice", type: "invoice", body: "Itemised", status: "approved", preparedBy: "Amina", amount: 180_000, createdAtLabel: "2026-06-01" },
];

const demoOrders = [
  { id: "dm-ord-1", total: 250_000, customerId: "dm-cust-1", createdAt: "2026-06-05" },
  { id: "dm-ord-2", total: 180_000, customerId: "dm-cust-2", createdAt: "2026-06-03" },
  { id: "dm-ord-3", total: 420_000, customerId: "dm-cust-1", createdAt: "2026-05-28" },
  { id: "dm-ord-4", total: 95_000, customerId: "dm-cust-3", createdAt: "2026-06-01" },
  { id: "dm-ord-5", total: 310_000, customerId: "dm-cust-4", createdAt: "2026-05-15" },
];

const demoCustomers = [
  { id: "dm-cust-1", name: "David Ibileke", totalSpent: 690_000, orderCount: 2 },
  { id: "dm-cust-2", name: "Oluwatimilehin Alabi", totalSpent: 180_000, orderCount: 1 },
  { id: "dm-cust-3", name: "Amina Okafor", totalSpent: 95_000, orderCount: 1 },
  { id: "dm-cust-4", name: "Chidi Eze", totalSpent: 310_000, orderCount: 1 },
];

const demoWalletTxns = [
  { id: "dm-wal-1", amount: 2_500_000, type: "credit" as const, label: "Opening balance", createdAt: "2026-01-01" },
  { id: "dm-wal-2", amount: 420_000, type: "credit" as const, label: "Payment received", createdAt: "2026-06-01" },
  { id: "dm-wal-3", amount: 250_000, type: "debit" as const, label: "Diesel purchase", createdAt: "2026-06-03" },
  { id: "dm-wal-4", amount: 98_400, type: "credit" as const, label: "Cashback earned", createdAt: "2026-06-05" },
  { id: "dm-wal-5", amount: 120_000, type: "debit" as const, label: "Brake pads", createdAt: "2026-06-01" },
];

export function getDemoWorkspaceData(): WorkspaceData {
  return {
    requests: demoRequests, expenses: demoExpenses, issues: demoIssues,
    inventory: demoInventory, documents: demoDocuments, orders: demoOrders,
    customers: demoCustomers, walletTransactions: demoWalletTxns,
  };
}