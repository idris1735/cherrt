export type KnowledgeArticle = {
  id: string;
  type: "faq" | "process" | "policy";
  title: string;
  body: string;
  tags: string[];
};

export const demoKnowledgeArticles: KnowledgeArticle[] = [
  // ── FAQs ──────────────────────────────────────────────────────────────────────
  {
    id: "faq-1",
    type: "faq",
    title: "How do I request office supplies or materials?",
    body: "Raise a Supply request via Chertt chat (or WhatsApp). Include the item name, quantity, and reason. Requests go to your line manager for approval. Approved requests are sent to the Store for fulfilment. You'll get a WhatsApp notification when it's approved or declined.",
    tags: ["supplies", "request", "store"],
  },
  {
    id: "faq-2",
    type: "faq",
    title: "Who approves emergency expenses?",
    body: "Expenses up to ₦50,000 can be approved by your direct supervisor. Above ₦50,000 requires the Finance Manager. Above ₦200,000 requires executive approval. In an emergency, call the Finance Desk first, then raise the request immediately after. All emergency approvals must be documented within 24 hours.",
    tags: ["expense", "approval", "finance", "emergency"],
  },
  {
    id: "faq-3",
    type: "faq",
    title: "How are petty cash receipts submitted to Accounts?",
    body: "Take a clear photo of each receipt and send it on WhatsApp or upload via Chertt. The expense is logged automatically with the amount and vendor. Accounts collects all logged expenses weekly every Friday by 4 PM. Physical receipts must be submitted to the Finance office within 3 working days of the transaction.",
    tags: ["petty cash", "receipts", "accounts", "finance"],
  },
  {
    id: "faq-4",
    type: "faq",
    title: "How do I report a facility issue or equipment fault?",
    body: "Send a message on WhatsApp or use Chertt chat: describe the issue, where it is, and how urgent it is. Attach a photo if you can — it helps Facilities resolve it faster. High-severity issues (e.g. power failure, water damage, security breach) are escalated immediately to the Facilities Manager. You'll get an update within 24 hours for medium issues, 4 hours for high.",
    tags: ["facility", "issue", "maintenance", "reporting"],
  },
  {
    id: "faq-5",
    type: "faq",
    title: "How do I check inventory / find out if an item is in stock?",
    body: "Ask Chertt: 'Is [item] in stock?' or 'Check inventory for [item name]'. The Store Manager can also confirm stock levels. Low-stock items are flagged automatically when they fall below the reorder level. To request an item from the store, raise a Supply request.",
    tags: ["inventory", "stock", "store"],
  },
  {
    id: "faq-6",
    type: "faq",
    title: "How do I get a letter or memo drafted and signed?",
    body: "Tell Chertt what you need: 'Draft a letter to [recipient] about [topic]'. Chertt will prepare it and route it to the appropriate signatory. Unauthorised staff can start the draft; the authorised approver applies the signature on review. Signed letters are saved to your workspace Documents.",
    tags: ["letter", "memo", "document", "signature"],
  },
  {
    id: "faq-7",
    type: "faq",
    title: "How do I onboard a new staff member?",
    body: "Create a staff profile in the Directory via Chertt: name, job title, unit, and phone number. Then schedule an orientation appointment. Assign an onboarding owner who will guide them through the checklist. Links and policy documents should be sent via the staff's WhatsApp or email on their first day. Use the Onboarding section in Toolkit to track progress.",
    tags: ["onboarding", "new staff", "HR", "directory"],
  },
  {
    id: "faq-8",
    type: "faq",
    title: "Who do I contact for IT support?",
    body: "Report IT issues via the Chertt issue tracker: describe the problem, your device, and urgency. For critical failures (system down, data loss), call the IT desk directly. IT support hours are Monday–Friday 8 AM–6 PM. After-hours emergencies: escalate to your line manager who will contact on-call IT.",
    tags: ["IT", "support", "tech", "help"],
  },

  // ── Process Documents ──────────────────────────────────────────────────────────
  {
    id: "proc-1",
    type: "process",
    title: "Emergency spending procedure",
    body: "Step 1: Verbal approval — call your supervisor or the Finance Manager before spending. Step 2: Spend and keep the receipt. Step 3: Photograph the receipt and send it on WhatsApp immediately after. Step 4: Raise a formal Expense request in Chertt within 24 hours. Step 5: Finance logs and reconciles within 3 working days. Spending without prior approval will not be reimbursed unless it's a genuine life-safety emergency.",
    tags: ["emergency", "expense", "procedure", "finance"],
  },
  {
    id: "proc-2",
    type: "process",
    title: "Vehicle documents register",
    body: "All organisation vehicles must have the following documents current and on file: (1) Proof of ownership / vehicle particulars, (2) Roadworthiness certificate — renewable annually, (3) Third-party insurance — renewable annually, (4) Driver's licence for all assigned drivers. Documents are stored in the Facilities folder. Ask Chertt to 'show vehicle documents' to pull the current status. Alert the Facilities Manager at least 30 days before any document expires.",
    tags: ["vehicle", "documents", "facilities", "compliance"],
  },
  {
    id: "proc-3",
    type: "process",
    title: "Vendor onboarding checklist",
    body: "Before any vendor is approved for payment: (1) Collect company registration certificate or BN number, (2) Collect bank account details and confirm with a voided cheque or bank letter, (3) Collect completed Vendor Form (ask Chertt to 'create a vendor form'), (4) Finance Manager signs off on the vendor profile, (5) Vendor is added to the approved vendors list. No payment should be made to a vendor not on the approved list.",
    tags: ["vendor", "procurement", "compliance", "finance"],
  },
  {
    id: "proc-4",
    type: "process",
    title: "Front desk escalation process",
    body: "Level 1 — Visitor query: handle at front desk. Level 2 — Unresolved query or complaint: escalate to duty supervisor within 10 minutes. Level 3 — Disruptive visitor or security concern: call security immediately and notify the duty manager. Level 4 — Emergency (medical, fire, threat): call emergency services (199/112) first, then notify management. Log all Level 2+ escalations in Chertt as an Issue report.",
    tags: ["front desk", "escalation", "security", "visitor"],
  },
  {
    id: "proc-5",
    type: "process",
    title: "Petty cash reimbursement process",
    body: "Step 1: Make the purchase and collect the receipt. Step 2: Photograph the receipt clearly (all amounts visible). Step 3: Send the photo on WhatsApp — Chertt will auto-log the expense. Step 4: Submit the physical receipt to the Finance office within 3 working days. Step 5: Finance processes the reimbursement in the next payroll cycle or petty cash disbursement, whichever comes first. Maximum petty cash reimbursement per transaction: ₦25,000 without pre-approval.",
    tags: ["petty cash", "reimbursement", "finance", "receipt"],
  },
  {
    id: "proc-6",
    type: "process",
    title: "Staff leave application process",
    body: "Step 1: Notify your line manager verbally at least 5 working days in advance (emergency leave: ASAP). Step 2: Raise a Leave request via Chertt — include type (annual, sick, emergency), start date, and return date. Step 3: Line manager approves or declines in Chertt. Step 4: Approved leave is logged and HR is notified automatically. Annual leave entitlement is 21 working days per year. Carry-over is limited to 5 days and must be used by March 31st.",
    tags: ["leave", "HR", "approval", "staff"],
  },

  // ── Policies ──────────────────────────────────────────────────────────────────
  {
    id: "policy-1",
    type: "policy",
    title: "Expense approval thresholds",
    body: "₦0–₦50,000: Line manager approval. ₦50,001–₦200,000: Finance Manager approval. ₦200,001–₦500,000: CEO or COO approval. Above ₦500,000: Board approval required. Emergency exceptions must be documented within 24 hours. All expenses must have a receipt or invoice. No split-billing to avoid approval thresholds.",
    tags: ["expense", "approval", "finance", "policy", "thresholds"],
  },
  {
    id: "policy-2",
    type: "policy",
    title: "Document signing authority",
    body: "Letters (internal): Line manager or above. Letters (external, non-financial): Department Head. Financial letters / payment authorisations: Finance Manager + COO (dual sign). Legal documents: CEO + Legal Counsel. Memos: Originating staff member (self-authored). Invoices: Finance Manager. Contracts above ₦1M: Board signature required. Chertt routes documents to the correct signatory automatically based on type and amount.",
    tags: ["signature", "approval", "document", "authority", "policy"],
  },
];

export function buildKnowledgeContextString(articles: KnowledgeArticle[]): string {
  if (!articles.length) return "";
  const faqs = articles.filter((a) => a.type === "faq");
  const procs = articles.filter((a) => a.type === "process");
  const policies = articles.filter((a) => a.type === "policy");

  const parts: string[] = ["[Knowledge Base — use this to answer process, policy, and FAQ questions]"];
  if (faqs.length) {
    parts.push("FAQs:");
    faqs.forEach((a) => parts.push(`Q: ${a.title}\nA: ${a.body}`));
  }
  if (procs.length) {
    parts.push("Process Documents:");
    procs.forEach((a) => parts.push(`${a.title}: ${a.body}`));
  }
  if (policies.length) {
    parts.push("Policies:");
    policies.forEach((a) => parts.push(`${a.title}: ${a.body}`));
  }
  return parts.join("\n\n");
}
