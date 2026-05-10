"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import { toolkitOnboardingChecklist } from "@/lib/data/toolkit";
import {
  createOnboardingTrack,
  deleteOnboardingTrack,
  loadOnboardingTracks,
  updateOnboardingNotes,
  updateOnboardingTrackSteps,
  type OnboardingTrack,
  type OnboardingTrackInput,
} from "@/lib/services/onboarding-admin";

const STEP_COUNT = toolkitOnboardingChecklist.length;
const CATEGORIES = Array.from(new Set(toolkitOnboardingChecklist.map((s) => s.category)));

const EMPTY_DRAFT: OnboardingTrackInput = {
  personId: "",
  staffName: "",
  roleTitle: "",
  ownerName: "",
  dueLabel: "",
};

const STATUS_COLORS: Record<string, string> = {
  completed: "#27ae60",
  "in-progress": "#e67e22",
  "not-started": "var(--muted)",
};

function pct(track: OnboardingTrack) {
  return Math.round((track.completedSteps.length / STEP_COUNT) * 100);
}

function StatusBadge({ status }: { status: string }) {
  const label = status === "completed" ? "Completed" : status === "in-progress" ? "In progress" : "Not started";
  return (
    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: STATUS_COLORS[status] ?? "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {label}
    </span>
  );
}

export default function ToolkitOnboardingPage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [tracks, setTracks] = useState<OnboardingTrack[]>([]);
  const [draft, setDraft] = useState<OnboardingTrackInput>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingNotes, setPendingNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    loadOnboardingTracks(snapshot.workspace.id).then((loaded) => {
      if (!cancelled) setTracks(loaded);
    });
    return () => { cancelled = true; };
  }, [snapshot.workspace.id]);

  const stats = useMemo(() => ({
    completed: tracks.filter((t) => t.status === "completed").length,
    inProgress: tracks.filter((t) => t.status === "in-progress").length,
    notStarted: tracks.filter((t) => t.status === "not-started").length,
  }), [tracks]);

  function choosePerson(personId: string) {
    const person = snapshot.directory.find((p) => p.id === personId);
    setDraft((d) => ({ ...d, personId, staffName: person?.name ?? d.staffName, roleTitle: person?.title ?? d.roleTitle }));
  }

  async function addTrack(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.staffName.trim()) return;
    setSaving(true);
    const created = await createOnboardingTrack(snapshot.workspace.id, {
      personId: draft.personId,
      staffName: draft.staffName.trim(),
      roleTitle: draft.roleTitle.trim() || "New starter",
      ownerName: draft.ownerName.trim() || snapshot.membership.userName,
      dueLabel: draft.dueLabel.trim() || "This week",
    });
    setSaving(false);
    if (!created) return;
    setTracks((current) => [created, ...current]);
    setDraft(EMPTY_DRAFT);
    setExpandedId(created.id);
  }

  async function toggleStep(track: OnboardingTrack, stepId: string) {
    const completedSteps = track.completedSteps.includes(stepId)
      ? track.completedSteps.filter((s) => s !== stepId)
      : [...track.completedSteps, stepId];
    const updated = await updateOnboardingTrackSteps(snapshot.workspace.id, track.id, completedSteps, STEP_COUNT);
    if (!updated) return;
    setTracks((current) => current.map((t) => (t.id === track.id ? updated : t)));
  }

  const saveNotes = useCallback(async (track: OnboardingTrack, notes: string) => {
    await updateOnboardingNotes(snapshot.workspace.id, track.id, notes);
    setTracks((current) => current.map((t) => (t.id === track.id ? { ...t, notes } : t)));
  }, [snapshot.workspace.id]);

  async function removeTrack(track: OnboardingTrack) {
    if (!confirm(`Remove onboarding tracker for ${track.staffName}?`)) return;
    const ok = await deleteOnboardingTrack(snapshot.workspace.id, track.id);
    if (!ok) return;
    setTracks((current) => current.filter((t) => t.id !== track.id));
    if (expandedId === track.id) setExpandedId(null);
  }

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">People</p>
          <h1 className="tk-page-title">Staff onboarding</h1>
          <p className="tk-page-desc">
            Track every new starter from first day to probation review, with step-by-step checklists and visible owners.
          </p>
        </div>
        <Link className="button button--primary" href={`${base}/appointments`}>
          Book orientation
        </Link>
      </div>

      {/* Stats */}
      <div className="tk-requests-summary">
        <div className="tk-requests-summary__item"><span>Tracked</span><strong>{tracks.length}</strong></div>
        <div className="tk-requests-summary__item"><span>In progress</span><strong>{stats.inProgress}</strong></div>
        <div className="tk-requests-summary__item"><span>Completed</span><strong>{stats.completed}</strong></div>
        <div className="tk-requests-summary__item"><span>Not started</span><strong>{stats.notStarted}</strong></div>
      </div>

      <div className="tk-layout-2 tk-layout-2--balanced">
        {/* Left: active trackers */}
        <div className="tk-stack-lg">

          {tracks.length === 0 ? (
            <div className="tk-card">
              <div className="tk-soft-tile">
                <strong>No onboarding trackers yet</strong>
                <p style={{ marginTop: 4 }}>Create one from the form on the right. Each tracker follows a staff member through {STEP_COUNT} onboarding steps.</p>
              </div>
            </div>
          ) : (
            <div className="tk-mini-stack">
              {tracks.map((track) => {
                const isOpen = expandedId === track.id;
                const percent = pct(track);
                const notesDraft = pendingNotes[track.id] ?? track.notes;

                return (
                  <div className="tk-card" key={track.id}>
                    {/* Header row */}
                    <button
                      onClick={() => setExpandedId(isOpen ? null : track.id)}
                      style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
                      type="button"
                    >
                      <div className="tk-card-head" style={{ marginBottom: 8 }}>
                        <div>
                          <strong style={{ fontSize: "1rem" }}>{track.staffName}</strong>
                          <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
                            {track.roleTitle} · Owner: {track.ownerName || "Unassigned"} · Due: {track.dueLabel || "TBD"}
                          </p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <StatusBadge status={track.status} />
                          <span style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--accent)" }}>{percent}%</span>
                          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{isOpen ? "▲" : "▼"}</span>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="tk-dept-bar__track">
                        <div className="tk-dept-bar__fill" style={{ width: `${percent}%` }} />
                      </div>
                    </button>

                    {isOpen && (
                      <div style={{ marginTop: 16 }}>
                        {/* Checklist grouped by category */}
                        {CATEGORIES.map((cat) => {
                          const steps = toolkitOnboardingChecklist.filter((s) => s.category === cat);
                          return (
                            <div key={cat} style={{ marginBottom: 16 }}>
                              <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 8px" }}>{cat}</p>
                              <div className="tk-onboarding-list">
                                {steps.map((step) => {
                                  const done = track.completedSteps.includes(step.id);
                                  return (
                                    <label
                                      className="tk-onboarding-step"
                                      key={step.id}
                                      style={{ cursor: "pointer", opacity: done ? 0.7 : 1 }}
                                    >
                                      <input
                                        checked={done}
                                        onChange={() => void toggleStep(track, step.id)}
                                        style={{ width: 17, height: 17, flexShrink: 0 }}
                                        type="checkbox"
                                      />
                                      <div className="tk-onboarding-step__body">
                                        <strong style={{ textDecoration: done ? "line-through" : "none" }}>{step.label}</strong>
                                        <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>{step.description}</p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                        {/* Notes */}
                        <div style={{ marginTop: 12 }}>
                          <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 6px" }}>Notes</p>
                          <textarea
                            onBlur={() => void saveNotes(track, notesDraft)}
                            onChange={(e) => setPendingNotes((prev) => ({ ...prev, [track.id]: e.target.value }))}
                            placeholder="Add notes about this starter's onboarding..."
                            rows={3}
                            style={{ width: "100%", resize: "vertical", fontSize: "0.85rem", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--text)", boxSizing: "border-box" }}
                            value={notesDraft}
                          />
                        </div>

                        {/* Actions */}
                        <div className="tk-requests-toolbar" style={{ marginTop: 10 }}>
                          <Link className="button button--ghost" href={`${base}/appointments`}>Book orientation</Link>
                          <Link className="button button--ghost" href={`${base}/documents`}>Add document</Link>
                          <button className="tk-inline-link" onClick={() => void removeTrack(track)} type="button" style={{ color: "#c0392b" }}>Remove</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Checklist reference */}
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Reference</p>
                <h2 className="tk-card-title">Standard onboarding steps ({STEP_COUNT})</h2>
              </div>
            </div>
            {CATEGORIES.map((cat) => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 8px" }}>{cat}</p>
                <div className="tk-onboarding-list">
                  {toolkitOnboardingChecklist.filter((s) => s.category === cat).map((step, i) => (
                    <div className="tk-onboarding-step" key={step.id}>
                      <div className="tk-onboarding-step__num">{i + 1}</div>
                      <div className="tk-onboarding-step__body">
                        <strong>{step.label}</strong>
                        <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: create form + links */}
        <div className="tk-side-stack">
          <form className="tk-card" onSubmit={(e) => void addTrack(e)}>
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">New tracker</p>
                <h2 className="tk-card-title">Assign new starter</h2>
              </div>
            </div>

            <label className="field" htmlFor="onb-person">
              <span>Pick from directory</span>
              <select id="onb-person" onChange={(e) => choosePerson(e.target.value)} value={draft.personId}>
                <option value="">Manual entry</option>
                {snapshot.directory.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            <label className="field" htmlFor="onb-name">
              <span>Staff name</span>
              <input id="onb-name" onChange={(e) => setDraft((d) => ({ ...d, staffName: e.target.value }))} placeholder="Full name" value={draft.staffName} />
            </label>

            <label className="field" htmlFor="onb-role">
              <span>Role</span>
              <input id="onb-role" onChange={(e) => setDraft((d) => ({ ...d, roleTitle: e.target.value }))} placeholder="Job title" value={draft.roleTitle} />
            </label>

            <label className="field" htmlFor="onb-owner">
              <span>Onboarding owner</span>
              <input id="onb-owner" onChange={(e) => setDraft((d) => ({ ...d, ownerName: e.target.value }))} placeholder={snapshot.membership.userName} value={draft.ownerName} />
            </label>

            <label className="field" htmlFor="onb-due">
              <span>Due by</span>
              <input id="onb-due" onChange={(e) => setDraft((d) => ({ ...d, dueLabel: e.target.value }))} placeholder="End of week 1" value={draft.dueLabel} />
            </label>

            <button className="button button--primary" disabled={saving || !draft.staffName.trim()} type="submit" style={{ marginTop: 4 }}>
              {saving ? "Creating..." : "Create tracker"}
            </button>
          </form>

          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Quick links</p>
                <h2 className="tk-card-title">Related sections</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/directory`}>
                <strong>Staff directory</strong>
                <p>Find team members and contact details.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/knowledge`}>
                <strong>Process knowledge</strong>
                <p>Operational FAQs and policy guides for new starters.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/documents`}>
                <strong>Smart documents</strong>
                <p>Offer letters, policy documents, and signed paperwork.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/appointments`}>
                <strong>Appointments</strong>
                <p>Schedule orientation and first-week check-ins.</p>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
