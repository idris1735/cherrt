# Chertt — Architecture Tree (2026-08-15)

> WhatsApp is the product. The web is the platform console. Everything funnels
> through guarded services into a deny-all Supabase schema.

```mermaid
graph TD
  subgraph Surface["🌐 Surfaces"]
    WA["📱 WhatsApp<br/>(members, leaders, guests)"]
    ONB["🖥️ Onboarding form<br/>/onboard/:token"]
    QR["🔗 QR posters<br/>/qr"]
    ADMIN["🛡️ Platform console<br/>/admin (Chertt team only)"]
    PAY["💳 /pay + /api/paystack"]
  end

  subgraph Ingest["📥 Ingestion"]
    HOOK["Webhook<br/>/api/whatsapp/webhook"]
    PROC["whatsapp-processor.ts<br/>routing + session state"]
  end

  subgraph Safety["🛡️ Safety front (before ANY AI)"]
    RISK["assessRisk()<br/>scam / safeguarding triage"]
    CONSENT["Consent gate<br/>first-contact + opt-out"]
    DEDUP["whatsapp_processed_messages"]
  end

  subgraph AI["🧠 AI layer"]
    AGENT["Agent runtime<br/>runAgentLoop · step-capped"]
    GATES["Role gates (minRank)<br/>Confirmation gates<br/>dataSensitive / IT wall"]
    MENU["Role-aware menus<br/>menu.ts"]
    CREATOR["Single-shot creator<br/>(legacy fallback)"]
    GUEST["Guest persona agent"]
    PERSONA["Persona<br/>never-re-ask · no-pray<br/>scam rules · kids"]
  end

  subgraph Tools["🔧 Tool sets (schema-locked)"]
    T1["Church: members, giving,<br/>first-timers, pastoral forms"]
    T2["Children: check-in, pickup,<br/>register (guardian-gated)"]
    T3["Community: events,<br/>departments (+approvals)"]
    T4["Care: prayer, pastoral,<br/>milestones"]
    T5["Money: give_now (confirmed),<br/>record_giving, summaries"]
    T6["Governed: attachments,<br/>person attributes, QR"]
  end

  subgraph Approvals["✅ Approvals (quorum)"]
    Q["approvals table<br/>any / n_of_m / all<br/>per-approver decisions"]
    QPURE["quorum.ts (pure math)"]
    QDEPT["department.ts<br/>row-id buttons"]
  end

  subgraph Data["🗄️ Data (Supabase)"]
    D_ID["Identity spine: people,<br/>phone_contacts,<br/>branch_memberships"]
    D_CH["Church: workspaces (+join_code),<br/>ministry_units, organizations"]
    D_LIFE["Life: first_timers, giving_records,<br/>prayer, pastoral, milestones"]
    D_KID["Kids: child_profiles,<br/>guardianships, child_checkins"]
    D_MEM["Memory: whatsapp_sessions,<br/>send_logs, chat_attachments"]
    D_GOV["Governed: person_attributes,<br/>approvals, flagged_messages"]
    D_KYC["KYC: applications + Mono results"]
    RLS["RLS deny-all · service-role writes"]
    BUCKETS["Buckets: kyc (private)<br/>chat-attachments (private)<br/>workspace-attachments"]
  end

  subgraph Third["🔌 Third parties"]
    META["Meta WhatsApp Cloud API"]
    GEM["Gemini 2.5 Flash"]
    MONO["Mono (CAC + NIN lookup)"]
    MAIL["Resend → Hostinger SMTP<br/>(email OTP chain)"]
    PAYSTACK["Paystack (giving)"]
  end

  WA --> HOOK --> PROC
  ONB --> KYC_API["/api/onboard/*"] --> MONO
  QR --> PROC
  PROC --> DEDUP --> RISK --> CONSENT --> AGENT
  ADMIN --> API["/api/admin/* (platform-gated)"] --> DATA
  AGENT --> GATES --> Tools
  Tools --> Approvals --> D_CH
  MENU --> GATES
  AGENT --> PERSONA
  CREATOR --> D_LIFE
  Data --> RLS
  D_KYC --> BUCKETS
  META --> HOOK
  GEM --> AGENT
  MAIL --> KYC_API
```

## Data flow (one inbound WhatsApp message)

```mermaid
sequenceDiagram
  participant U as Member
  participant M as Meta
  participant W as Webhook
  participant P as Processor
  participant S as Safety
  participant A as Agent
  participant T as Tools
  participant DB as Supabase

  U->>M: sends text / voice / image
  M->>W: webhook + delivery statuses
  W->>P: claim + dedupe
  P->>S: assessRisk() BEFORE any AI
  alt scam / safeguarding
    S->>P: refuse + warn + flagMessage
  else clean
    P->>S: consent gate (first contact?)
    S-->>P: gate menu / opt-out check
    P->>A: dispatch with identity + known profile
    A->>T: tool calls (role-gated, capped)
    T->>DB: scoped writes (service role)
    T-->>A: results
    A-->>P: reply or pending confirmation
    P->>M: reply / tap buttons
    M->>W: delivery status → send_logs
  end
```

## Security rails (what the AI cannot cross)

```mermaid
graph LR
  A[AI] -->|must pass| G1["Role gate: minRank + dataSensitive<br/>(IT can configure, never read)"]
  A -->|must pass| G2["Confirmation gate: money, broadcast,<br/>child release, special-category writes"]
  A -->|must pass| G3["Guardian gate: child data"]
  A -->|must pass| G4["Consent gate: people data"]
  A -->|must pass| G5["Quorum: approvals any/n_of_m/all"]
  A -->|hard cap| G6["DEFAULT_MAX_STEPS = 5"]
  A -->|never| G7["dynamic schema · praying · OTP reads<br/>· money transfers on say-so"]
```

## Repository tree (what lives where)

```
cherrt/
├── src/
│   ├── app/
│   │   ├── api/whatsapp/webhook/       # Meta entry (messages + statuses)
│   │   ├── api/onboard/                # KYC form, email-code, submit
│   │   ├── api/admin/                  # platform console APIs + kyc-health
│   │   ├── api/pay|paystack/           # giving
│   │   ├── onboard/[token]/            # church onboarding form (validated)
│   │   ├── qr/                         # printable QR posters + /qr/img
│   │   └── admin/                      # console: overview, churches, people,
│   │                                   #   kyc, flagged, settings(+health)
│   ├── components/admin/               # Kimi design system + charts + InfoTip
│   ├── components/{shell,shared,auth,forms,providers}/
│   └── lib/services/
│       ├── agent/                      # runtime, persona, tools, menu, access,
│       │                               #   audit, guardrails.test
│       ├── safety/                     # risk.ts (scam/safeguarding), flags.ts
│       ├── approvals/                  # quorum.ts, department.ts
│       ├── identity/                   # people, provisioning, otp, role-catalog,
│       │                               #   assign-role-flow
│       ├── kyc/                        # applications, mono, checks, review,
│       │                               #   email-otp (SMTP→Resend), storage
│       ├── privacy/                    # consent, opt-out
│       └── whatsapp-*.ts, whatsapp.ts  # processor, session, workspace, send
├── supabase/migrations/                # 60+ versioned SQL files (all applied)
├── scripts/                            # reset-demo.mjs, seed-demo.mjs
├── docs/                               # demo-presentation.md, prompts, specs
└── CHRONICLE.md                        # the living log
```

## Approvals: quorum rules

| quorum | rule |
|---|---|
| `any` | first decision decides (department joins) |
| `n_of_m` | `required` approvals decide; too many declines make it unreachable |
| `all` | every approver must approve; one decline kills it |

Every decision is recorded per approver (`approvals.decisions`) — no silent
first-come-wins, and `/admin` can show the trail.
