"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";

type HomeLink = {
  href: string;
  label: string;
  hint: string;
  accent: string;
  tint: string;
  icon: ReactNode;
};

const quickActions: HomeLink[] = [
  {
    href: "/chat",
    label: "Draft a letter",
    hint: "Letters, memos, and signed documents",
    accent: "#d85e2f",
    tint: "#fff2ea",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4.5h5l3 3V19.5H8A2.5 2.5 0 0 1 5.5 17V7A2.5 2.5 0 0 1 8 4.5Z" />
        <path d="M13 4.5v4h4M9 12h6M9 15h4" />
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Request expense",
    hint: "Raise approvals for cash and purchases",
    accent: "#b56223",
    tint: "#fdf0e3",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10M14.5 9.5a2.5 2.5 0 0 0-5 0c0 1.4.9 2 2.5 2.5s2.5 1.1 2.5 2.5a2.5 2.5 0 0 1-5 0" />
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Report issue",
    hint: "Capture facility and operations incidents",
    accent: "#c0432a",
    tint: "#fff0ea",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 9v4M12 17h.01M10.3 4.5 3 17h18L13.7 4.5a2 2 0 0 0-3.4 0Z" />
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Log petty cash",
    hint: "Record spend and attach receipts",
    accent: "#705b45",
    tint: "#f4efe9",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7.5h16v9H4v-9Z" />
        <path d="M8 12h8M7 4.5h10" />
      </svg>
    ),
  },
];

const capabilityLinks: HomeLink[] = [
  {
    href: "/chat",
    label: "AI command",
    hint: "Turn natural language into tracked work",
    accent: "#d85e2f",
    tint: "#fff2ea",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
      </svg>
    ),
  },
  {
    href: "/documents",
    label: "Smart documents",
    hint: "Letters, invoices, signatures, and templates",
    accent: "#a14f2d",
    tint: "#fff1ea",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4.5h5l3 3V19.5H8A2.5 2.5 0 0 1 5.5 17V7A2.5 2.5 0 0 1 8 4.5Z" />
        <path d="M13 4.5v4h4M9 12h6M9 15h4" />
      </svg>
    ),
  },
  {
    href: "/requests",
    label: "Requests & approvals",
    hint: "Expenses, supplies, repairs, and decisions",
    accent: "#8f5b2e",
    tint: "#fcf4e7",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 4.5h6" />
        <path d="M8 6.5h8A2.5 2.5 0 0 1 18.5 9v9A2.5 2.5 0 0 1 16 20.5H8A2.5 2.5 0 0 1 5.5 18V9A2.5 2.5 0 0 1 8 6.5Z" />
        <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5" />
      </svg>
    ),
  },
  {
    href: "/inventory",
    label: "Inventory",
    hint: "Store levels, releases, and reorder checks",
    accent: "#2f6f82",
    tint: "#edf7fa",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 8.5 12 4l7.5 4.5v7L12 20l-7.5-4.5v-7Z" />
        <path d="M12 11.5 19.5 8M12 11.5 4.5 8M12 11.5V20" />
      </svg>
    ),
  },
  {
    href: "/issues",
    label: "Issue reporting",
    hint: "Facility, security, and incident reports",
    accent: "#c0432a",
    tint: "#fff0ea",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 9v4M12 17h.01M10.3 4.5 3 17h18L13.7 4.5a2 2 0 0 0-3.4 0Z" />
      </svg>
    ),
  },
  {
    href: "/feedback",
    label: "Polls & feedback",
    hint: "Surveys, reviews, and quick internal input",
    accent: "#8f5b2e",
    tint: "#fcf4e7",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 6.5h14v8H9l-4 4v-12Z" />
        <path d="M9 10h6M9 7.5h4" />
      </svg>
    ),
  },
  {
    href: "/expenses",
    label: "Petty cash",
    hint: "Spend logs, receipts, and finance traceability",
    accent: "#705b45",
    tint: "#f4efe9",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7.5h16v9H4v-9Z" />
        <path d="M8 12h8M7 4.5h10" />
      </svg>
    ),
  },
  {
    href: "/forms",
    label: "Simple forms",
    hint: "Custom internal forms for changing workflows",
    accent: "#d85e2f",
    tint: "#fff2ea",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.5 5.5h9A2.5 2.5 0 0 1 19 8v8.5A2.5 2.5 0 0 1 16.5 19h-9A2.5 2.5 0 0 1 5 16.5V8A2.5 2.5 0 0 1 7.5 5.5Z" />
        <path d="M8.5 10h7M8.5 13.5h7M8.5 17h4" />
      </svg>
    ),
  },
  {
    href: "/appointments",
    label: "Appointments",
    hint: "Meetings, sign-off slots, and reminders",
    accent: "#2f6f82",
    tint: "#edf7fa",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 4.5v3M17 4.5v3M5.5 8h13A1.5 1.5 0 0 1 20 9.5v9A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-9A1.5 1.5 0 0 1 5.5 8Z" />
        <path d="M4 11.5h16" />
      </svg>
    ),
  },
  {
    href: "/knowledge",
    label: "FAQs & process docs",
    hint: "Procedure notes, documents, and answers",
    accent: "#705b45",
    tint: "#f4efe9",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.5 5.5h9A2.5 2.5 0 0 1 19 8v9.5A1.5 1.5 0 0 1 17.5 19H8a3 3 0 0 0-3 3V8A2.5 2.5 0 0 1 7.5 5.5Z" />
        <path d="M9 10h6M9 13.5h5" />
      </svg>
    ),
  },
  {
    href: "/onboarding",
    label: "Staff onboarding",
    hint: "Starter checklists, links, and first-week tasks",
    accent: "#b56223",
    tint: "#fdf0e3",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="2.5" />
        <path d="M5.5 18a4 4 0 0 1 7 0M15.5 7.5h4M17.5 5.5v4" />
      </svg>
    ),
  },
  {
    href: "/directory",
    label: "Staff directory",
    hint: "People, roles, units, and contact details",
    accent: "#d85e2f",
    tint: "#fff2ea",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8.5" r="3" />
        <circle cx="16.5" cy="10" r="2.5" />
        <path d="M4.5 19a5 5 0 0 1 9 0M13.5 18.5a4 4 0 0 1 6 0" />
      </svg>
    ),
  },
];

export default function ToolkitHomePage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const requests = snapshot.requests.filter((request) => request.module === "toolkit");
  const pending = requests.filter((request) => request.status === "pending").length;
  const openIssues = snapshot.issues.filter((issue) => issue.status !== "completed" && issue.status !== "approved").length;
  const lowStock = snapshot.inventory.filter((item) => item.inStock <= item.minLevel).length;
  const documentsAwaitingSignature = snapshot.documents.filter((document) => document.awaitingSignatureFrom).length;
  const recentRequests = requests.slice(0, 2);
  const recentActivity = snapshot.activities.filter((activity) => activity.module === "toolkit").slice(0, 4);
  const attentionItems = [
    {
      href: `${base}/requests`,
      title: `${pending} approvals waiting`,
      note: "Move pending requests forward.",
      visible: pending > 0,
    },
    {
      href: `${base}/issues`,
      title: `${openIssues} issues still open`,
      note: "Review facility and incident reports.",
      visible: openIssues > 0,
    },
    {
      href: `${base}/documents`,
      title: `${documentsAwaitingSignature} documents awaiting signature`,
      note: "Follow up on files that need sign-off.",
      visible: documentsAwaitingSignature > 0,
    },
    {
      href: `${base}/inventory`,
      title: `${lowStock} items near reorder level`,
      note: "Check stock before requests are delayed.",
      visible: lowStock > 0,
    },
  ].filter((item) => item.visible);

  return (
    <div className="tk-home">
      <div className="tk-home__layout">
        <aside className="tk-home__rail">
          <section className="tk-home__section tk-home__section--wide">
            <div className="tk-home__section-head">
              <p className="tk-section-label">Everything in Business Toolkit</p>
              <Link className="tk-section-link" href={`${base}/records`}>
                Open records
              </Link>
            </div>
            <div className="tk-capability-grid">
              {capabilityLinks.map((item) => (
                <Link
                  className="tk-capability"
                  href={`${base}${item.href}`}
                  key={item.label}
                  style={
                    {
                      "--tk-cap-accent": item.accent,
                      "--tk-cap-tint": item.tint,
                    } as CSSProperties
                  }
                >
                  <span className="tk-capability__icon">{item.icon}</span>
                  <div className="tk-capability__body">
                    <strong>{item.label}</strong>
                    <span>{item.hint}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </aside>

        <div className="tk-home__content">
          <section className="tk-home__hero">
            <div className="tk-home__lede">
              <p className="tk-home__eyebrow">Business Toolkit</p>
              <h1 className="tk-home__greeting">What do you need today?</h1>
              <p className="tk-home__intro">Start in chat and let Chertt turn it into structured work.</p>
            </div>

            <Link className="tk-home__prompt" href={`${base}/chat`}>
              <span className="tk-home__prompt-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
                </svg>
              </span>
              <span className="tk-home__prompt-copy">
                <strong>Try "Draft a letter to HR"</strong>
                <span>Request expense, report an issue, or find a process note.</span>
              </span>
              <span className="tk-home__prompt-action">Open chat</span>
            </Link>

            <div className="tk-home__signals">
              <Link className="tk-signal tk-signal--link" href={`${base}/requests`}>
                <strong>{pending}</strong>
                <span>Pending approvals</span>
              </Link>
              <Link className="tk-signal tk-signal--link" href={`${base}/issues`}>
                <strong>{openIssues}</strong>
                <span>Open issues</span>
              </Link>
              <Link className="tk-signal tk-signal--link" href={`${base}/inventory`}>
                <strong>{lowStock}</strong>
                <span>Low stock items</span>
              </Link>
              <Link className="tk-signal tk-signal--link" href={`${base}/documents`}>
                <strong>{documentsAwaitingSignature}</strong>
                <span>Awaiting signature</span>
              </Link>
            </div>
          </section>

          <div className="tk-home__main">
            <div className="tk-home__primary">
              <section className="tk-home__section">
                <div className="tk-home__section-head">
                  <p className="tk-section-label">Quick actions</p>
                </div>
                <div className="tk-tiles tk-tiles--actions">
                  {quickActions.map((action) => (
                    <Link
                      className="tk-tile"
                      href={`${base}${action.href}`}
                      key={action.label}
                      style={
                        {
                          "--tk-cap-accent": action.accent,
                          "--tk-cap-tint": action.tint,
                        } as CSSProperties
                      }
                    >
                      <span className="tk-tile__icon">{action.icon}</span>
                      <div className="tk-tile__body">
                        <span className="tk-tile__label">{action.label}</span>
                        <span className="tk-tile__hint">{action.hint}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>

              <section className="tk-home__section">
                <div className="tk-home__section-head">
                  <p className="tk-section-label">Recent activity</p>
                  <Link className="tk-section-link" href={`${base}/requests`}>
                    See requests
                  </Link>
                </div>
                <div className="tk-activity-list">
                  {recentActivity.map((item) => (
                    <Link className="tk-activity-item" href={`${base}/requests`} key={item.id}>
                      <span className="tk-activity-item__dot" />
                      <div className="tk-activity-item__body">
                        <span className="tk-activity-item__title">{item.title}</span>
                        <span className="tk-activity-item__meta">
                          {item.detail} - {item.timeLabel}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            </div>

            <aside className="tk-home__secondary">
              <section className="tk-home__section">
                <div className="tk-home__section-head">
                  <p className="tk-section-label">Priority now</p>
                </div>
                <div className="tk-card">
                  <div className="tk-mini-stack">
                    {attentionItems.length > 0 ? (
                      attentionItems.map((item) => (
                        <Link className="tk-soft-tile tk-soft-tile--link" href={item.href} key={item.title}>
                          <strong>{item.title}</strong>
                          <p>{item.note}</p>
                        </Link>
                      ))
                    ) : (
                      <div className="tk-soft-tile">
                        <strong>No urgent blockers</strong>
                        <p>Requests, issues, and sign-offs are under control right now.</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="tk-home__section">
                <div className="tk-home__section-head">
                  <p className="tk-section-label">Open requests</p>
                </div>
                <div className="tk-card">
                  <div className="tk-list">
                    {recentRequests.map((request) => (
                      <Link className="tk-row tk-row--link" href={`${base}/requests/${request.id}`} key={request.id}>
                        <div className="tk-row__main">
                          <strong>{request.title}</strong>
                          <p>{request.type} - {request.requester}</p>
                        </div>
                        <div className="tk-row__aside">
                          <span className="tk-badge">{request.status}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
