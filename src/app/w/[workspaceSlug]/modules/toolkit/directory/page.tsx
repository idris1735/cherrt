"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import type { Person } from "@/lib/types";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function ToolkitDirectoryPage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [selected, setSelected] = useState<Person | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return snapshot.directory;
    return snapshot.directory.filter((person) => {
      const haystack = `${person.name} ${person.title} ${person.unit} ${person.phone}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, snapshot.directory]);

  const byUnit = filtered.reduce<Record<string, Person[]>>((acc, person) => {
    (acc[person.unit] ??= []).push(person);
    return acc;
  }, {});
  const units = Object.keys(byUnit).sort();

  return (
    <>
      <div className="tk-page tk-dir-min">
        <div className="tk-page-head">
          <div className="tk-page-head__copy">
            <p className="tk-eyebrow">People</p>
            <h1 className="tk-page-title">Staff directory</h1>
            <p className="tk-page-desc">Minimal contact view for quick lookup and action.</p>
          </div>
          <Link className="tk-inline-link" href={`/w/${snapshot.workspace.slug}/chat`}>
            Find in chat
          </Link>
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
                      <span className="tk-dir-min__phone">{person.phone}</span>
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
                  <strong>{selected.phone}</strong>
                </div>
              </div>
            </div>
            <div className="tk-modal__actions">
              <a className="button button--primary" href={`tel:${selected.phone}`}>
                Call {selected.name.split(" ")[0]}
              </a>
              <Link className="button button--ghost" href={`${base}/directory/${selected.id}`} onClick={() => setSelected(null)}>
                Open profile
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

