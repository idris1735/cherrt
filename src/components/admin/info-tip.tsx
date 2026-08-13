"use client";

import { useId, useState } from "react";

/**
 * WS4 — accessible jargon explainer. Hover shows the tooltip; on touch,
 * tapping toggles it. `title` gives every browser a native fallback, and the
 * text is wired via aria-describedby for screen readers.
 */
export function InfoTip({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="info-tip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="info-tip-btn"
        aria-describedby={id}
        title={text}
        aria-label={text}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        ⓘ
      </button>
      <span id={id} role="tooltip" className={`info-tip-pop ${open ? "open" : ""}`}>{text}</span>
    </span>
  );
}

export const TIPS = {
  l0: "L0 — Unverified: we know this person but their number isn't confirmed yet.",
  l1: "L1 — WhatsApp-verified: their number is confirmed through WhatsApp (a message proves control of the phone).",
  l2: "L2 — KYC/ID-verified: their identity passed a government ID (NIN/BVN) check during onboarding.",
  cac: "CAC lookup — the church's registration was checked against the CAC registry.",
  trustee: "Trustee match — the applicant's name was matched against the registered trustees of the company.",
  id: "ID verification — the applicant's government ID (NIN/BVN) was verified.",
  kycPending: "Pending — submitted and waiting for a platform reviewer to approve or reject.",
  kycDraft: "Draft — the application is incomplete and hasn't been submitted for review.",
  kycApproved: "Approved — verified; the church is live on Chertt.",
  kycRejected: "Rejected — the application was declined; the applicant was notified with the reason.",
} as const;
