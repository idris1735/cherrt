export type Role =
  | "owner"
  | "admin"
  | "approver"
  | "finance"
  | "operations"
  | "pastoral"
  | "store-manager"
  | "event-manager";

export type WorkflowStatus =
  | "draft"
  | "pending"
  | "approved"
  | "in-progress"
  | "completed"
  | "flagged";

export type ModuleKey = "toolkit" | "church" | "store" | "events";

export type NotificationKind = "approval" | "message" | "event" | "payment" | "system";

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  legalName: string;
  sector: string;
  city: string;
  timezone: string;
  currency: string;
  modules: ModuleKey[];
  brand: {
    accent: string;
    secondary: string;
    paper: string;
    highlight: string;
  };
}

export interface Membership {
  id: string;
  workspaceId: string;
  userName: string;
  email: string;
  role: Role;
  title: string;
  avatarInitials: string;
}

export interface ApprovalStep {
  id: string;
  label: string;
  assignee: string;
  dueLabel: string;
  completed: boolean;
}

export interface WorkflowRequest {
  id: string;
  type: string;
  title: string;
  description: string;
  requester: string;
  amount?: number;
  status: WorkflowStatus;
  module: ModuleKey;
  createdAtLabel: string;
  approvalSteps: ApprovalStep[];
}

export interface SmartDocument {
  id: string;
  title: string;
  type: "letter" | "invoice" | "memo";
  body: string;
  status: WorkflowStatus;
  preparedBy: string;
  awaitingSignatureFrom?: string;
  amount?: number;
  createdAtLabel: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  location: string;
  inStock: number;
  minLevel: number;
  reserved: number;
}

export interface IssueReport {
  id: string;
  title: string;
  area: string;
  severity: "low" | "medium" | "high";
  status: WorkflowStatus;
  mediaCount: number;
  reportedBy: string;
}

export interface ExpenseEntry {
  id: string;
  title: string;
  department: string;
  amount: number;
  receiptCount: number;
  status: WorkflowStatus;
}

export interface FormDefinition {
  id: string;
  name: string;
  submissions: number;
  owner: string;
}

export interface FeedbackPoll {
  id: string;
  title: string;
  lane: "pulse" | "approval" | "guest";
  audience: string;
  owner: string;
  questionCount: number;
  responseCount: number;
  targetCount: number;
  status: "active" | "closed";
  updatedAtLabel: string;
}

export interface Person {
  id: string;
  name: string;
  title: string;
  unit: string;
  phone: string;
}

export interface Appointment {
  id: string;
  title: string;
  when: string;
  owner: string;
}

export interface GivingRecord {
  id: string;
  donor: string;
  amount: number;
  channel: string;
  service: string;
}

export interface CareRequest {
  id: string;
  requester: string;
  type: string;
  status: WorkflowStatus;
  notes: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  sku: string;
}

export interface Order {
  id: string;
  customer: string;
  itemCount: number;
  total: number;
  status: WorkflowStatus;
  fulfillmentCode: string;
}

export interface Invoice {
  id: string;
  customer: string;
  amount: number;
  status: WorkflowStatus;
  paymentLinkStatus: "generated" | "opened" | "paid";
}

export interface Receipt {
  id: string;
  payer: string;
  amount: number;
  issuedAtLabel: string;
}

export interface PaymentLink {
  id: string;
  label: string;
  amount: number;
  status: "generated" | "opened" | "paid";
}

export interface EventRecord {
  id: string;
  title: string;
  dateLabel: string;
  venue: string;
  guestsExpected: number;
  guestsCheckedIn: number;
}

export interface Registration {
  id: string;
  eventTitle: string;
  attendee: string;
  ticketType: string;
  status: WorkflowStatus;
}

export interface Ticket {
  id: string;
  attendee: string;
  eventTitle: string;
  code: string;
  status: "issued" | "checked-in";
}

export interface CheckIn {
  id: string;
  guest: string;
  eventTitle: string;
  method: "qr" | "manual";
  checkedInAtLabel: string;
}

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  timeLabel: string;
  read: boolean;
}

export interface Message {
  id: string;
  speaker: "user" | "assistant" | "teammate" | "system";
  text: string;
  timeLabel: string;
}

export interface Conversation {
  id: string;
  title: string;
  mode: "ai" | "team";
  messages: Message[];
}

export interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  timeLabel: string;
  module: ModuleKey;
}

export interface ChannelAdapter {
  id: "app" | "web" | "whatsapp";
  label: string;
  shippingStatus: "active" | "planned";
  notes: string;
}

export interface WorkspaceSnapshot {
  workspace: Workspace;
  membership: Membership;
  notifications: Notification[];
  conversations: Conversation[];
  requests: WorkflowRequest[];
  documents: SmartDocument[];
  inventory: InventoryItem[];
  issues: IssueReport[];
  expenses: ExpenseEntry[];
  forms: FormDefinition[];
  polls: FeedbackPoll[];
  directory: Person[];
  appointments: Appointment[];
  giving: GivingRecord[];
  careRequests: CareRequest[];
  products: Product[];
  orders: Order[];
  invoices: Invoice[];
  receipts: Receipt[];
  paymentLinks: PaymentLink[];
  events: EventRecord[];
  registrations: Registration[];
  tickets: Ticket[];
  checkIns: CheckIn[];
  activities: ActivityItem[];
}

export interface SuggestedArtifact {
  kind:
    | "document"
    | "request"
    | "event"
    | "payment-link"
    | "appointment"
    | "form"
    | "inventory"
    | "issue"
    | "expense-log"
    | "poll"
    | "directory";
  headline: string;
  supportingText: string;
}

export interface AiCommandResult {
  reply: string;
  artifact?: SuggestedArtifact;
  generatedDocument?: SmartDocument;
  generatedRequest?: WorkflowRequest;
  generatedPaymentLink?: PaymentLink;
  generatedAppointment?: Appointment;
  generatedForm?: FormDefinition;
  generatedInventoryItem?: InventoryItem;
  generatedIssueReport?: IssueReport;
  generatedExpenseEntry?: ExpenseEntry;
  generatedPoll?: FeedbackPoll;
  generatedPerson?: Person;
}
