"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { downloadCsv } from "@/lib/services/csv-export";
import {
  buildDemoFormSubmissions,
  createFormSubmission,
  formatSubmissionResponses,
  loadFormSubmissions,
  parseSubmissionResponses,
  updateFormSubmissionStatus,
  type FormSubmission,
  type FormSubmissionStatus,
} from "@/lib/services/form-submissions";

const EMPTY_FORM = {
  submitterName: "",
  submitterContact: "",
  responses: "Department: \nRequest: \nPriority: ",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function ToolkitFormDetailPage() {
  const params = useParams<{ formId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const base = `/w/${params.workspaceSlug}/modules/toolkit`;
  const chatHref = `/w/${params.workspaceSlug}/chat`;
  const form = snapshot.forms.find((entry) => entry.id === params.formId);

  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entry, setEntry] = useState(EMPTY_FORM);
  const [selected, setSelected] = useState<FormSubmission | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!form) return;
      setLoading(true);
      const loaded = await loadFormSubmissions(snapshot.workspace.id, form.id);
      if (cancelled) return;
      const rows = loaded?.length ? loaded : buildDemoFormSubmissions(form);
      setSubmissions(rows);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [form, snapshot.workspace.id]);

  const statusCounts = useMemo(() => {
    return submissions.reduce<Record<FormSubmissionStatus, number>>(
      (acc, submission) => {
        acc[submission.status] += 1;
        return acc;
      },
      { received: 0, reviewed: 0, closed: 0 },
    );
  }, [submissions]);

  if (!form) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={base + "/forms"}>Back to forms</Link>
          </div>
          <p className="tk-eyebrow">Form</p>
          <h2 className="tk-card-title">Form not found</h2>
        </div>
      </div>
    );
  }

  const activeForm = form;

  async function addSubmission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const responses = parseSubmissionResponses(entry.responses);
    if (!entry.submitterName.trim() || !Object.keys(responses).length) return;
    setSaving(true);
    const created = await createFormSubmission(snapshot.workspace.id, {
      formId: activeForm.id,
      submitterName: entry.submitterName.trim(),
      submitterContact: entry.submitterContact.trim(),
      responses,
    });
    setSaving(false);
    if (!created) return;
    setSubmissions((current) => [created, ...current.filter((submission) => !submission.id.startsWith("demo-"))]);
    setEntry(EMPTY_FORM);
  }

  async function changeStatus(submission: FormSubmission, status: FormSubmissionStatus) {
    const ok = await updateFormSubmissionStatus(snapshot.workspace.id, activeForm.id, submission.id, status);
    if (!ok) return;
    setSubmissions((current) => current.map((item) => (item.id === submission.id ? { ...item, status } : item)));
    setSelected((current) => (current?.id === submission.id ? { ...current, status } : current));
  }

  function exportSubmissions() {
    downloadCsv(`${activeForm.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-submissions.csv`, submissions, [
      { header: "Submitted at", value: (row) => row.submittedAt },
      { header: "Submitter", value: (row) => row.submitterName },
      { header: "Contact", value: (row) => row.submitterContact },
      { header: "Status", value: (row) => row.status },
      { header: "Responses", value: (row) => formatSubmissionResponses(row.responses) },
    ]);
  }

  const shownCount = Math.max(form.submissions, submissions.length);
  const hasDemoRows = submissions.some((submission) => submission.id.startsWith("demo-"));

  return (
    <>
      <div className="tk-page">
        <div className="tk-page-head">
          <div className="tk-page-head__copy">
            <p className="tk-eyebrow">Form responses</p>
            <h1 className="tk-page-title">{form.name}</h1>
            <p className="tk-page-desc">Owned by {form.owner}. Review submissions, capture walk-in responses, and export for handoff.</p>
          </div>
          <div className="tk-requests-toolbar">
            <Link className="button button--ghost" href={`${base}/forms`}>Forms</Link>
            <Link className="button button--primary" href={chatHref}>Update in chat</Link>
          </div>
        </div>

        <div className="tk-requests-summary">
          <div className="tk-requests-summary__item">
            <span>Total responses</span>
            <strong>{shownCount}</strong>
          </div>
          <div className="tk-requests-summary__item">
            <span>Received</span>
            <strong>{statusCounts.received}</strong>
          </div>
          <div className="tk-requests-summary__item">
            <span>Reviewed</span>
            <strong>{statusCounts.reviewed}</strong>
          </div>
          <div className="tk-requests-summary__item">
            <span>Closed</span>
            <strong>{statusCounts.closed}</strong>
          </div>
        </div>

        <div className="tk-layout-2 tk-layout-2--balanced">
          <section className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Submission viewer</p>
                <h2 className="tk-card-title">{submissions.length} detailed row{submissions.length === 1 ? "" : "s"}</h2>
              </div>
              <button className="button button--ghost" disabled={!submissions.length} onClick={exportSubmissions} type="button">
                Export CSV
              </button>
            </div>

            {hasDemoRows ? (
              <div className="tk-soft-tile" style={{ marginBottom: 14 }}>
                <strong>Demo detail sample</strong>
                <p>This form has a legacy response count. Detailed rows will be stored for new submissions from now on.</p>
              </div>
            ) : null}

            {loading ? (
              <div className="tk-soft-tile"><strong>Loading responses...</strong></div>
            ) : submissions.length ? (
              <div className="tk-list">
                {submissions.map((submission) => (
                  <button className="tk-row tk-row--link" key={submission.id} onClick={() => setSelected(submission)} type="button">
                    <div className="tk-row__main">
                      <strong>{submission.submitterName}</strong>
                      <p>{submission.submitterContact || "No contact"} - {Object.keys(submission.responses).length} answer{Object.keys(submission.responses).length === 1 ? "" : "s"}</p>
                    </div>
                    <div className="tk-row__aside">
                      <span>{formatDate(submission.submittedAt)}</span>
                      <span className="tk-badge">{submission.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="tk-soft-tile">
                <strong>No detailed submissions yet</strong>
                <p>Add the first response here or let WhatsApp/chat generated submissions land in this table.</p>
              </div>
            )}
          </section>

          <aside className="tk-side-stack">
            <form className="tk-card" onSubmit={(event) => void addSubmission(event)}>
              <div className="tk-card-head">
                <div className="tk-card-head__copy">
                  <p className="tk-eyebrow">Capture response</p>
                  <h2 className="tk-card-title">Add submission</h2>
                </div>
              </div>

              <label className="field" htmlFor="submitter-name">
                <span>Submitter name</span>
                <input id="submitter-name" onChange={(event) => setEntry((current) => ({ ...current, submitterName: event.target.value }))} placeholder="Full name" value={entry.submitterName} />
              </label>

              <label className="field" htmlFor="submitter-contact">
                <span>Contact</span>
                <input id="submitter-contact" onChange={(event) => setEntry((current) => ({ ...current, submitterContact: event.target.value }))} placeholder="Phone or email" value={entry.submitterContact} />
              </label>

              <label className="field" htmlFor="responses">
                <span>Responses</span>
                <textarea id="responses" onChange={(event) => setEntry((current) => ({ ...current, responses: event.target.value }))} rows={7} value={entry.responses} />
              </label>

              <button className="button button--primary" disabled={saving || !entry.submitterName.trim()} type="submit">
                {saving ? "Saving..." : "Save response"}
              </button>
            </form>
          </aside>
        </div>
      </div>

      {selected ? (
        <div className="tk-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="tk-modal" onClick={(event) => event.stopPropagation()}>
            <div className="tk-modal__head">
              <div>
                <div className="tk-modal__title">{selected.submitterName}</div>
                <div className="tk-modal__subtitle">{selected.submitterContact || "No contact"} - {formatDate(selected.submittedAt)}</div>
              </div>
              <button className="tk-modal__close" onClick={() => setSelected(null)} type="button" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="tk-modal__body">
              <div className="tk-mini-stack">
                {Object.entries(selected.responses).map(([key, answer]) => (
                  <div className="tk-soft-tile" key={key}>
                    <strong>{key}</strong>
                    <p>{answer}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="tk-modal__actions">
              <button className="button button--ghost" onClick={() => void changeStatus(selected, "reviewed")} type="button">Mark reviewed</button>
              <button className="button button--primary" onClick={() => void changeStatus(selected, "closed")} type="button">Close response</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
