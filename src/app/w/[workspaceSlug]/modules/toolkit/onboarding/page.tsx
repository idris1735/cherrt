"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import uiStyles from "@/components/ui/ui.module.css";
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
const EMPTY_DRAFT: OnboardingTrackInput = { personId: "", staffName: "", roleTitle: "", ownerName: "", dueLabel: "" };

function pct(track: OnboardingTrack) { return Math.round((track.completedSteps.length / STEP_COUNT) * 100); }

function toneFromStatus(status: string): "success" | "warning" | "neutral" {
  if (status === "completed") return "success";
  if (status === "in-progress") return "warning";
  return "neutral";
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
    loadOnboardingTracks(snapshot.workspace.id).then((loaded) => { if (!cancelled) setTracks(loaded); });
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
    const created = await createOnboardingTrack(snapshot.workspace.id, draft);
    if (created) { setTracks((t) => [...t, created]); setDraft(EMPTY_DRAFT); }
    setSaving(false);
  }

  async function toggleStep(track: OnboardingTrack, stepId: string) {
    const next = track.completedSteps.includes(stepId)
      ? track.completedSteps.filter((s) => s !== stepId)
      : [...track.completedSteps, stepId];
    const updated = await updateOnboardingTrackSteps(snapshot.workspace.id, track.id, next, STEP_COUNT);
    if (updated) setTracks((t) => t.map((tr) => (tr.id === track.id ? updated : tr)));
  }

  async function saveNotes(track: OnboardingTrack) {
    const notes = pendingNotes[track.id] ?? track.notes ?? "";
    const ok = await updateOnboardingNotes(snapshot.workspace.id, track.id, notes);
    if (ok) {
      setTracks((t) => t.map((tr) => (tr.id === track.id ? { ...tr, notes } : tr)));
      setPendingNotes((p) => { const n = { ...p }; delete n[track.id]; return n; });
    }
  }

  async function removeTrack(track: OnboardingTrack) {
    if (!confirm(`Remove "${track.staffName}" from onboarding?`)) return;
    const ok = await deleteOnboardingTrack(snapshot.workspace.id, track.id);
    if (ok) setTracks((t) => t.filter((tr) => tr.id !== track.id));
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <PageHeader
        title="Onboarding"
        meta={`${tracks.length} staff · ${stats.completed} done · ${stats.inProgress} in progress`}
        actions={<Link className="button button--primary" href={`${base}/chat`}>+ Add staff</Link>}
      />

      <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: "var(--ds-radius)", padding: "14px 16px", boxShadow: "var(--ds-shadow)" }}>
        <form onSubmit={addTrack} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <input value={draft.staffName} onChange={(e) => setDraft((d) => ({ ...d, staffName: e.target.value }))} placeholder="Staff name" className={uiStyles["ui-input"]} style={{ width: "150px" }} />
          <input value={draft.roleTitle} onChange={(e) => setDraft((d) => ({ ...d, roleTitle: e.target.value }))} placeholder="Role" className={uiStyles["ui-input"]} style={{ width: "130px" }} />
          <input value={draft.ownerName} onChange={(e) => setDraft((d) => ({ ...d, ownerName: e.target.value }))} placeholder="Owner" className={uiStyles["ui-input"]} style={{ width: "130px" }} />
          <select value={draft.personId} onChange={(e) => choosePerson(e.target.value)} className={uiStyles["ui-input"]} style={{ width: "160px" }}>
            <option value="">Link to directory...</option>
            {snapshot.directory.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="button button--primary" disabled={saving} type="submit">Add</button>
        </form>
      </div>

      {tracks.length === 0 ? (
        <EmptyState title="No onboarding tracks yet" hint="Add a new staff member above" />
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {tracks.map((track) => {
            const progress = pct(track);
            const isExpanded = expandedId === track.id;
            return (
              <div key={track.id} style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: "var(--ds-radius)", boxShadow: "var(--ds-shadow)", overflow: "hidden" }}>
                <button
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedId(isExpanded ? null : track.id)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "var(--ds-text)" }}
                >
                  <span style={{ fontWeight: 550, fontSize: "0.84rem", letterSpacing: "-0.01em", flex: 1 }}>{track.staffName}</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--ds-text-muted)" }}>{track.roleTitle}</span>
                  <Badge tone={toneFromStatus(track.status)}>{track.status === "completed" ? "Done" : track.status === "in-progress" ? "Active" : "Not started"}</Badge>
                  <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--ds-ink)", minWidth: "32px", textAlign: "right" }}>{progress}%</span>
                  <div style={{ width: "60px", height: "4px", borderRadius: "2px", background: "#f3f3f3", overflow: "hidden", flexShrink: 0 }}>
                    <div style={{ height: "100%", width: `${progress}%`, background: "var(--ds-accent)", borderRadius: "2px", transition: "width 0.3s ease" }} />
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ width: "14px", height: "14px", flexShrink: 0, transform: isExpanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s ease", color: "var(--ds-text-faint)" }}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {isExpanded && (
                  <div role="region" style={{ padding: "0 16px 14px", borderTop: "1px solid var(--ds-border)" }}>
                    {CATEGORIES.map((cat) => (
                      <div key={cat} style={{ marginTop: "10px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ds-text-muted)" }}>{cat}</span>
                        <div style={{ display: "grid", gap: "2px", marginTop: "4px" }}>
                          {toolkitOnboardingChecklist.filter((s) => s.category === cat).map((step) => {
                            const done = track.completedSteps.includes(step.id);
                            return (
                              <button
                                key={step.id}
                                onClick={() => toggleStep(track, step.id)}
                                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", border: "none", borderRadius: "6px", background: done ? "var(--ds-accent-weak)" : "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: "0.78rem", color: "var(--ds-text)", width: "100%" }}
                              >
                                <span style={{ width: "18px", height: "18px", borderRadius: "4px", border: done ? "none" : "1px solid var(--ds-border)", background: done ? "var(--ds-accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff", fontSize: "0.65rem" }}>
                                  {done ? "\u2713" : ""}
                                </span>
                                <span style={{ flex: 1, textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>{step.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    <div style={{ marginTop: "12px", display: "grid", gap: "6px" }}>
                      <textarea
                        value={pendingNotes[track.id] ?? track.notes ?? ""}
                        onChange={(e) => setPendingNotes((p) => ({ ...p, [track.id]: e.target.value }))}
                        placeholder="Notes..."
                        rows={2}
                        className={uiStyles["ui-textarea"]}
                      />
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button className="button button--ghost" onClick={() => saveNotes(track)} type="button" style={{ height: "28px", fontSize: "0.72rem" }}>Save notes</button>
                        <button className="button button--ghost" onClick={() => removeTrack(track)} type="button" style={{ height: "28px", fontSize: "0.72rem", color: "#dc2626" }}>Remove</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}