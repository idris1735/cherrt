"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import {
  createDirectoryPerson,
  deleteDirectoryPerson,
  loadDirectoryPeople,
  updateDirectoryPerson,
  type PersonInput,
} from "@/lib/services/directory-admin";
import type { Person } from "@/lib/types";

const EMPTY_PERSON: PersonInput = {
  name: "",
  title: "",
  unit: "",
  phone: "",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function waHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "#";
}

export default function ToolkitDirectoryPage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [people, setPeople] = useState<Person[]>(snapshot.directory);
  const [selected, setSelected] = useState<Person | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const [draft, setDraft] = useState<PersonInput>(EMPTY_PERSON);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const loaded = await loadDirectoryPeople(snapshot.workspace.id, snapshot.directory);
      if (!cancelled) setPeople(loaded);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [snapshot.directory, snapshot.workspace.id]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) => {
      const haystack = `${person.name} ${person.title} ${person.unit} ${person.phone}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [people, query]);

  const byUnit = filtered.reduce<Record<string, Person[]>>((acc, person) => {
    (acc[person.unit] ??= []).push(person);
    return acc;
  }, {});
  const units = Object.keys(byUnit).sort();

  function startCreate() {
    setEditing(null);
    setDraft(EMPTY_PERSON);
  }

  function startEdit(person: Person) {
    setEditing(person);
    setDraft({ name: person.name, title: person.title, unit: person.unit, phone: person.phone });
  }

  async function savePerson(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.unit.trim()) return;
    setSaving(true);
    const input = {
      name: draft.name.trim(),
      title: draft.title.trim() || "Team member",
      unit: draft.unit.trim(),
      phone: draft.phone.trim(),
    };
    const saved = editing
      ? await updateDirectoryPerson(snapshot.workspace.id, editing.id, input)
      : await createDirectoryPerson(snapshot.workspace.id, input);
    setSaving(false);
    if (!saved) return;
    setPeople((current) => {
      if (editing) return current.map((person) => (person.id === saved.id ? saved : person));
      return [saved, ...current];
    });
    setSelected(saved);
    setEditing(null);
    setDraft(EMPTY_PERSON);
  }

  async function removePerson(person: Person) {
    if (!confirm(`Remove ${person.name} from the directory?`)) return;
    const ok = await deleteDirectoryPerson(snapshot.workspace.id, person.id);
    if (!ok) return;
    setPeople((current) => current.filter((entry) => entry.id !== person.id));
    setSelected(null);
    if (editing?.id === person.id) setEditing(null);
  }

  return (
    <>
      <div className="tk-page tk-dir-min">
        <div className="tk-page-head">
          <div className="tk-page-head__copy">
            <p className="tk-eyebrow">People</p>
            <h1 className="tk-page-title">Staff directory</h1>
            <p className="tk-page-desc">Manage staff contacts, units, and quick call or WhatsApp actions.</p>
          </div>
          <div className="tk-requests-toolbar">
            <button className="button button--ghost" onClick={startCreate} type="button">New staff</button>
            <Link className="button button--primary" href={`/w/${snapshot.workspace.slug}/chat`}>
              Find in chat
            </Link>
          </div>
        </div>

        <div className="tk-dir-min__toolbar">
          <label className="tk-dir-min__search" htmlFor="directory-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4 4" />
            </svg>
            <input
              id="directory-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, unit, title, phone"
              type="text"
              value={query}
            />
          </label>

          <div className="tk-dir-min__stats">
            <div className="tk-dir-min__stat">
              <span>Staff</span>
              <strong>{filtered.length}</strong>
            </div>
            <div className="tk-dir-min__stat">
              <span>Units</span>
              <strong>{units.length}</strong>
            </div>
          </div>
        </div>

        <div className="tk-layout-2 tk-layout-2--balanced">
          <div>
            {units.length ? (
              <div className="tk-dir-min__sections">
                {units.map((unit) => (
                  <section className="tk-card tk-dir-min__section" key={unit}>
                    <div className="tk-dir-min__section-head">
                      <h2>{unit}</h2>
                      <span>{byUnit[unit].length}</span>
                    </div>

                    <div className="tk-dir-min__rows">
                      {byUnit[unit].map((person) => (
                        <button className="tk-dir-min__row" key={person.id} onClick={() => setSelected(person)} type="button">
                          <div className="tk-dir-min__avatar">{initials(person.name)}</div>
                          <div className="tk-dir-min__body">
                            <strong>{person.name}</strong>
                            <p>{person.title}</p>
                          </div>
                          <span className="tk-dir-min__phone">{person.phone || "No phone"}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="tk-card">
                <div className="tk-soft-tile">
                  <strong>No people found</strong>
                  <p>Try another search term or add team members to the directory.</p>
                </div>
              </div>
            )}
          </div>

          <form className="tk-card" onSubmit={(event) => void savePerson(event)}>
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">{editing ? "Edit staff" : "Add staff"}</p>
                <h2 className="tk-card-title">{editing ? editing.name : "Directory card"}</h2>
              </div>
            </div>
            <label className="field" htmlFor="person-name">
              <span>Name</span>
              <input id="person-name" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Full name" value={draft.name} />
            </label>
            <label className="field" htmlFor="person-title">
              <span>Title</span>
              <input id="person-title" onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Role or title" value={draft.title} />
            </label>
            <label className="field" htmlFor="person-unit">
              <span>Unit</span>
              <input id="person-unit" onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value }))} placeholder="Department or unit" value={draft.unit} />
            </label>
            <label className="field" htmlFor="person-phone">
              <span>Phone</span>
              <input id="person-phone" onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="2348012345678" value={draft.phone} />
            </label>
            <div className="tk-requests-toolbar">
              <button className="button button--primary" disabled={saving || !draft.name.trim() || !draft.unit.trim()} type="submit">
                {saving ? "Saving..." : editing ? "Save changes" : "Add staff"}
              </button>
              {editing ? <button className="button button--ghost" onClick={startCreate} type="button">Cancel</button> : null}
            </div>
          </form>
        </div>
      </div>

      {selected ? (
        <div className="tk-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="tk-modal" onClick={(event) => event.stopPropagation()}>
            <div className="tk-modal__head">
              <div>
                <div className="tk-modal__title">{selected.name}</div>
                <div className="tk-modal__subtitle">{selected.title} - {selected.unit}</div>
              </div>
              <button className="tk-modal__close" onClick={() => setSelected(null)} type="button" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="tk-modal__body">
              <div className="tk-modal__stat-row">
                <div className="tk-modal__stat">
                  <span>Title</span>
                  <strong>{selected.title}</strong>
                </div>
                <div className="tk-modal__stat">
                  <span>Unit</span>
                  <strong>{selected.unit}</strong>
                </div>
                <div className="tk-modal__stat">
                  <span>Phone</span>
                  <strong>{selected.phone || "Not set"}</strong>
                </div>
              </div>
            </div>
            <div className="tk-modal__actions">
              <a className="button button--primary" href={`tel:${selected.phone}`}>
                Call
              </a>
              <a className="button button--ghost" href={waHref(selected.phone)} rel="noreferrer" target="_blank">
                WhatsApp
              </a>
              <button className="button button--ghost" onClick={() => { startEdit(selected); setSelected(null); }} type="button">
                Edit
              </button>
              <Link className="button button--ghost" href={`${base}/directory/${selected.id}`} onClick={() => setSelected(null)}>
                Profile
              </Link>
              <button className="tk-inline-link" onClick={() => void removePerson(selected)} type="button">
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
