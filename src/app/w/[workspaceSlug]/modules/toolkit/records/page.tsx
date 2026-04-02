"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";

type RecordSection = {
  href: string;
  label: string;
  note: string;
  count: number;
  accent: string;
  tint: string;
  icon: ReactNode;
};

export default function ToolkitRecordsPage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const sections: RecordSection[] = [
    {
      href: "/documents",
      label: "Smart documents",
      note: "Letters, invoices, memos, and signature routing.",
      count: snapshot.documents.length,
      accent: "#d85e2f",
      tint: "#fff1ea",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 4.5h5l3 3V19.5H8A2.5 2.5 0 0 1 5.5 17V7A2.5 2.5 0 0 1 8 4.5Z" />
          <path d="M13 4.5v4h4M9 12h6M9 15h4" />
        </svg>
      ),
    },
    {
      href: "/inventory",
      label: "Inventory",
      note: "Stock levels, release approvals, and reorder checks.",
      count: snapshot.inventory.length,
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
      label: "Issues",
      note: "Facility, security, and incident reports in one queue.",
      count: snapshot.issues.length,
      accent: "#c0432a",
      tint: "#fff0ea",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4M12 17h.01M10.3 4.5 3 17h18L13.7 4.5a2 2 0 0 0-3.4 0Z" />
        </svg>
      ),
    },
    {
      href: "/expenses",
      label: "Petty cash",
      note: "Expense entries, receipt counts, and accounts handoff.",
      count: snapshot.expenses.length,
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
      note: "Custom internal forms for changing workflows.",
      count: snapshot.forms.length,
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
      note: "Orientation slots, sign-offs, reminders, and meetings.",
      count: snapshot.appointments.length,
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
      href: "/feedback",
      label: "Polls and feedback",
      note: "Pulse checks, approval reviews, and structured responses.",
      count: snapshot.polls.length,
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
      href: "/knowledge",
      label: "FAQs and process docs",
      note: "Process notes, operational memory, and quick recall.",
      count: 8,
      accent: "#705b45",
      tint: "#f4efe9",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.5 5.5h9A2.5 2.5 0 0 1 19 8v9.5A1.5 1.5 0 0 1 17.5 19H8a3 3 0 0 0-3 3V8A2.5 2.5 0 0 1 7.5 5.5Z" />
          <path d="M9 10h6M9 13.5h5" />
        </svg>
      ),
    },
  ];

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Records</p>
          <h1 className="tk-page-title">Business Toolkit records</h1>
          <p className="tk-page-desc">
            Everything operational that Chertt can create, track, recall, and move forward for your team.
          </p>
        </div>
        <Link className="button button--primary" href={`${base}/chat`}>
          Create from chat
        </Link>
      </div>

      <div className="tk-requests-summary">
        <Link className="tk-requests-summary__item tk-requests-summary__item--link" href={`${base}/documents`}>
          <span>Documents</span>
          <strong>{snapshot.documents.length}</strong>
        </Link>
        <Link className="tk-requests-summary__item tk-requests-summary__item--link" href={`${base}/inventory`}>
          <span>Stock items</span>
          <strong>{snapshot.inventory.length}</strong>
        </Link>
        <Link className="tk-requests-summary__item tk-requests-summary__item--link" href={`${base}/issues`}>
          <span>Open issues</span>
          <strong>{snapshot.issues.filter((item) => item.status !== "completed").length}</strong>
        </Link>
        <Link className="tk-requests-summary__item tk-requests-summary__item--link" href={`${base}/appointments`}>
          <span>Appointments</span>
          <strong>{snapshot.appointments.length}</strong>
        </Link>
      </div>

      <div className="tk-record-grid">
        {sections.map((section) => (
          <Link
            className="tk-record-card"
            href={`${base}${section.href}`}
            key={section.label}
            style={
              {
                "--tk-record-accent": section.accent,
                "--tk-record-tint": section.tint,
              } as CSSProperties
            }
          >
            <div className="tk-record-card__media">
              <span className="tk-record-card__count">{section.count}</span>
              <span className="tk-record-card__icon">{section.icon}</span>
            </div>

            <div className="tk-record-card__body">
              <div className="tk-record-card__copy">
                <p className="tk-eyebrow">Toolkit section</p>
                <h2 className="tk-card-title">{section.label}</h2>
                <p className="tk-page-desc">{section.note}</p>
              </div>
              <span className="tk-inline-link" style={{ minHeight: "auto", padding: 0 }}>
                Open section →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
