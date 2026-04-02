"use client";

import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";

const sections = [
  {
    href: "/documents",
    label: "Documents",
    desc: "Letters, invoices, memos, and routed signatures",
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
    desc: "Office and operational stock across locations",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-5 9 5v6l-9 5-9-5V9ZM12 4v16M3 9l9 5 9-5" />
      </svg>
    ),
  },
  {
    href: "/issues",
    label: "Issues",
    desc: "Facility problems and incident reporting",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 9v4M12 17h.01M10.3 4.5 3 17h18L13.7 4.5a2 2 0 0 0-3.4 0Z" />
      </svg>
    ),
  },
  {
    href: "/expenses",
    label: "Expenses",
    desc: "Petty cash entries, receipts, and accounts handoff",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10M14.5 9.5a2.5 2.5 0 0 0-5 0c0 1.4.9 2 2.5 2.5s2.5 1.1 2.5 2.5a2.5 2.5 0 0 1-5 0" />
      </svg>
    ),
  },
  {
    href: "/forms",
    label: "Forms",
    desc: "Simple internal forms for flexible workflows",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 5.5h8A2.5 2.5 0 0 1 18.5 8v10A2.5 2.5 0 0 1 16 20.5H8A2.5 2.5 0 0 1 5.5 18V8A2.5 2.5 0 0 1 8 5.5Z" />
        <path d="M9 10h6M9 14h6M9 18h4" />
      </svg>
    ),
  },
  {
    href: "/appointments",
    label: "Appointments",
    desc: "Operational meetings and follow-up scheduling",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 4.5v3M17 4.5v3M5 8.5h14v10A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5v-10Z" />
        <path d="M8.5 12h7M8.5 15.5h4" />
      </svg>
    ),
  },
  {
    href: "/directory",
    label: "People",
    desc: "Staff directory, onboarding checklists, and process notes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
      </svg>
    ),
  },
];

export default function ToolkitMorePage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Business Toolkit</p>
          <h1 className="tk-page-title">All sections</h1>
          <p className="tk-page-desc">
            Every operational surface in the toolkit, kept inside one clear module boundary.
          </p>
        </div>
      </div>

      <div className="tk-more-list">
        {sections.map((section) => (
          <Link className="tk-more-row" href={`${base}${section.href}`} key={section.href}>
            <span className="tk-more-row__icon">{section.icon}</span>
            <div className="tk-more-row__body">
              <strong>{section.label}</strong>
              <span>{section.desc}</span>
            </div>
            <svg className="tk-more-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}
