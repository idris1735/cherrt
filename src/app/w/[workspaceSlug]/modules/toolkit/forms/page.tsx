"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import type { FormDefinition } from "@/lib/types";

const formUseCases = [
  { title: "Staff request forms", desc: "Leave applications, equipment requests, and internal approvals." },
  { title: "Visitor and guest logs", desc: "Track who came in, when, and for what purpose." },
  { title: "Incident reports", desc: "Structured input for accidents, complaints, or security events." },
  { title: "Feedback and surveys", desc: "Collect scores, ratings, or written responses from any audience." },
] as const;

function formTheme(form: FormDefinition) {
  if (form.submissions >= 100) return { accent: "#2f6f82", tint: "#edf7fa", label: "High usage" };
  if (form.submissions >= 40) return { accent: "#8c6734", tint: "#fcf4e7", label: "Steady usage" };
  return { accent: "#d85e2f", tint: "#fff2ea", label: "Newer flow" };
}

export default function ToolkitFormsPage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [selected, setSelected] = useState<FormDefinition | null>(null);

  const forms = snapshot.forms;
  const totalSubmissions = forms.reduce((sum, f) => sum + f.submissions, 0);
  const topForm = [...forms].sort((a, b) => b.submissions - a.submissions)[0];

  return (
    <>
      <div className="tk-page">
        <div className="tk-page-head">
          <div className="tk-page-head__copy">
            <p className="tk-eyebrow">Simple forms</p>
            <h1 className="tk-page-title">Forms</h1>
            <p className="tk-page-desc">
              Flexible internal forms for workflows that vary from one organization to another.
            </p>
          </div>
          <Link className="button button--primary" href={`/w/${snapshot.workspace.slug}/chat`}>
            Create a form
          </Link>
        </div>

        <div className="tk-requests-summary">
          <div className="tk-requests-summary__item">
            <span>Active forms</span>
            <strong>{forms.length}</strong>
          </div>
          <div className="tk-requests-summary__item">
            <span>Total responses</span>
            <strong>{totalSubmissions}</strong>
          </div>
          {topForm ? (
            <div className="tk-requests-summary__item">
              <span>Top form</span>
              <strong style={{ fontSize: "0.84rem", lineHeight: "1.3" }}>{topForm.name}</strong>
            </div>
          ) : null}
        </div>

        <div className="tk-layout-2 tk-layout-2--balanced">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Form list</p>
                <h2 className="tk-card-title">{forms.length} form{forms.length !== 1 ? "s" : ""}</h2>
              </div>
            </div>

            {forms.length ? (
              <div className="tk-form-grid">
                {forms.map((form) => {
                  const theme = formTheme(form);
                  return (
                    <button
                      className="tk-form-card"
                      key={form.id}
                      onClick={() => setSelected(form)}
                      style={{ "--tk-form-accent": theme.accent, "--tk-form-tint": theme.tint } as CSSProperties}
                      type="button"
                    >
                      <div className="tk-form-card__media">
                        <span className="tk-form-card__label">{theme.label}</span>
                        <div className="tk-form-card__total">{form.submissions}</div>
                      </div>

                      <div className="tk-form-card__body">
                        <div className="tk-form-card__head">
                          <div>
                            <strong>{form.name}</strong>
                            <p>Owned by {form.owner}</p>
                          </div>
                          <span className="tk-badge">{form.submissions === 1 ? "1 response" : `${form.submissions} responses`}</span>
                        </div>

                        <div className="tk-form-card__stats">
                          <div className="tk-form-card__stat">
                            <span>Owner</span>
                            <strong>{form.owner}</strong>
                          </div>
                          <div className="tk-form-card__stat">
                            <span>Responses</span>
                            <strong>{form.submissions}</strong>
                          </div>
                        </div>

                        <div className="tk-form-card__footer">
                          <span className="tk-form-card__hint">Tap to see details and manage</span>
                          <span className="tk-inline-link" style={{ minHeight: "auto", padding: "0 10px", fontSize: "0.74rem" }}>View →</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="tk-soft-tile">
                <strong>No forms yet</strong>
                <p>Tell Chertt what you need to collect and it will scaffold the form structure.</p>
              </div>
            )}
          </div>

          <div className="tk-side-stack">
            <div className="tk-card">
              <div className="tk-card-head">
                <div className="tk-card-head__copy">
                  <p className="tk-eyebrow">Create a form</p>
                  <h2 className="tk-card-title">Ask in chat</h2>
                </div>
              </div>
              <div className="tk-mini-stack">
                <div className="tk-soft-tile">
                  <strong>Describe what you need</strong>
                  <p>Tell Chertt the form name, purpose, and who it is for. It will build the structure and make it ready to share.</p>
                </div>
                <Link className="button button--ghost" href={`/w/${snapshot.workspace.slug}/chat`}>Open chat</Link>
              </div>
            </div>

            <div className="tk-card">
              <div className="tk-card-head">
                <div className="tk-card-head__copy">
                  <p className="tk-eyebrow">Use cases</p>
                  <h2 className="tk-card-title">What forms cover</h2>
                </div>
              </div>
              <div className="tk-mini-stack">
                {formUseCases.map((uc) => (
                  <div className="tk-soft-tile" key={uc.title}>
                    <strong>{uc.title}</strong>
                    <p>{uc.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {selected ? (
        <div className="tk-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="tk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tk-modal__head">
              <div>
                <div className="tk-modal__title">{selected.name}</div>
                <div className="tk-modal__subtitle">Owned by {selected.owner}</div>
              </div>
              <button className="tk-modal__close" onClick={() => setSelected(null)} type="button" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="tk-modal__body">
              <div className="tk-modal__stat-row">
                <div className="tk-modal__stat">
                  <span>Responses</span>
                  <strong>{selected.submissions}</strong>
                </div>
                <div className="tk-modal__stat">
                  <span>Owner</span>
                  <strong>{selected.owner}</strong>
                </div>
                <div className="tk-modal__stat">
                  <span>Activity</span>
                  <strong>{formTheme(selected).label}</strong>
                </div>
              </div>
            </div>
            <div className="tk-modal__actions">
              <Link className="button button--ghost" href={`/w/${snapshot.workspace.slug}/chat`} onClick={() => setSelected(null)}>
                Manage in chat
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

