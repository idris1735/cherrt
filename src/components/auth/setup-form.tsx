"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import clsx from "clsx";
import { useRouter } from "next/navigation";

import { BrandMark } from "@/components/shared/brand-mark";
import { saveOnboardingDraft } from "@/lib/services/onboarding-draft";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import type { ModuleKey } from "@/lib/types";

type ChoiceOption = {
  id: string;
  label: string;
};

type ChoiceGroupConfig = {
  id: string;
  label: string;
  type: "single" | "multi";
  options: ChoiceOption[];
  hint?: string;
};

type TextFieldConfig = {
  id: string;
  label: string;
  placeholder: string;
  type?: "text" | "email";
  hint?: string;
};

type SelectFieldConfig = {
  id: string;
  label: string;
  placeholder: string;
  options: string[];
  hint?: string;
};

type LongTextFieldConfig = {
  id: string;
  label: string;
  placeholder: string;
  rows: number;
  hint?: string;
};

type FieldConfig = TextFieldConfig | SelectFieldConfig | LongTextFieldConfig;

type SetupSection = {
  eyebrow: string;
  title: string;
  description: string;
  fields?: FieldConfig[];
  choiceGroups?: ChoiceGroupConfig[];
};

type ModuleConfig = {
  title: string;
  detail: string;
  accentClass: string;
  summary: string[];
  sections: SetupSection[];
  sharedFieldOverrides?: Partial<Record<SharedFieldId, Partial<FieldConfig>>>;
};

type SharedFieldId = "orgName" | "adminName" | "email" | "role" | "size" | "location";

const sharedFields: FieldConfig[] = [
  {
    id: "orgName",
    label: "Organization name",
    placeholder: "e.g. Mercy Point Church",
    type: "text",
    hint: "This becomes the workspace name across the app.",
  },
  {
    id: "adminName",
    label: "Admin name",
    placeholder: "e.g. Sarah Cole",
    type: "text",
    hint: "The first workspace owner and default approver profile.",
  },
  {
    id: "email",
    label: "Work email",
    placeholder: "e.g. hello@organization.com",
    type: "email",
    hint: "Used for sign-in, notifications, and shared records.",
  },
  { id: "role", label: "Primary role", placeholder: "e.g. Operations Lead", type: "text", hint: "Shown on your profile and directory card." },
  {
    id: "size",
    label: "Team size",
    placeholder: "Select a range",
    options: ["1 - 10 people", "11 - 50 people", "51 - 200 people", "200+ people"],
    hint: "Used to shape starter permissions and sample views.",
  },
  {
    id: "location",
    label: "Primary city or campus",
    placeholder: "e.g. London, UK",
    type: "text",
    hint: "Used in workspace records, receipts, and event or branch defaults.",
  },
];

function getSharedFields(selectedModule: ModuleKey): FieldConfig[] {
  const overrides = moduleConfigs[selectedModule].sharedFieldOverrides ?? {};

  return sharedFields.map((field) => {
    const fieldOverrides = overrides[field.id as SharedFieldId];

    if (!fieldOverrides) {
      return field;
    }

    return {
      ...field,
      ...fieldOverrides,
    } as FieldConfig;
  });
}

const moduleConfigs: Record<ModuleKey, ModuleConfig> = {
  toolkit: {
    title: "Business Toolkit",
    detail: "Internal operations, approvals, smart documents, inventory, and requests.",
    accentClass: "setup-panel--toolkit",
    summary: [
      "Request categories and approval routing",
      "Document, inventory, and expense defaults",
      "Department-ready workspace structure",
    ],
    sharedFieldOverrides: {
      orgName: { placeholder: "e.g. Northfield Group" },
      adminName: { placeholder: "e.g. Jordan Miles" },
      email: { placeholder: "e.g. ops@northfieldgroup.com" },
      role: { placeholder: "e.g. Operations Manager" },
      location: { placeholder: "e.g. Birmingham, UK" },
    },
    sections: [
      {
        eyebrow: "Operations profile",
        title: "What should the toolkit launch with?",
        description: "These answers decide the first records, categories, and approvals inside Business Toolkit.",
        choiceGroups: [
          {
            id: "ops-focus",
            label: "Turn on the tools you need first",
            type: "multi",
            hint: "We will pre-fill the workspace navigation and starter records from these choices.",
            options: [
              { id: "documents", label: "Smart documents" },
              { id: "approvals", label: "Approvals" },
              { id: "inventory", label: "Inventory" },
              { id: "reporting", label: "Issue reporting" },
              { id: "expenses", label: "Petty cash" },
            ],
          },
          {
            id: "approval-style",
            label: "How should approvals move?",
            type: "single",
            hint: "This becomes the default request flow until you edit policies later.",
            options: [
              { id: "single", label: "Single approver" },
              { id: "sequential", label: "Sequential chain" },
              { id: "multi", label: "Multi-step review" },
            ],
          },
        ],
      },
      {
        eyebrow: "Documents and control",
        title: "Set your working structure",
        description: "Give us the names and categories Chertt should use on day one.",
        fields: [
          {
            id: "departmentList",
            label: "Departments or units",
            placeholder: "e.g. Admin, Finance, Operations",
            rows: 3,
            hint: "Used in staff directory, forms, and request routing.",
          },
          {
            id: "requestTypes",
            label: "Request types",
            placeholder: "e.g. Purchase request, repair request, travel request",
            rows: 3,
            hint: "These become starter request templates.",
          },
          {
            id: "inventoryLocations",
            label: "Inventory locations",
            placeholder: "e.g. Main store, media room, front desk cabinet",
            rows: 3,
            hint: "Used if you release stock or track office items.",
          },
          {
            id: "expenseCategories",
            label: "Expense categories",
            placeholder: "e.g. Fuel, repairs, supplies",
            rows: 3,
            hint: "Used for petty cash and expense logging.",
          },
        ],
      },
    ],
  },
  church: {
    title: "ChurchBase",
    detail: "Giving, member care, check-in, first timers, and registrations.",
    accentClass: "setup-panel--church",
    summary: [
      "Church identity and service defaults",
      "Care, giving, and follow-up routing",
      "Children check-in and member data structure",
    ],
    sharedFieldOverrides: {
      orgName: { placeholder: "e.g. Grace Harbour Church" },
      adminName: { placeholder: "e.g. Daniel Reed" },
      email: { placeholder: "e.g. office@graceharbour.church" },
      role: { placeholder: "e.g. Church Administrator" },
      location: { placeholder: "e.g. Accra, Ghana" },
    },
    sections: [
      {
        eyebrow: "Church identity",
        title: "Set up your church profile",
        description: "This shapes member records, check-in, and communications from the start.",
        fields: [
          {
            id: "branchName",
            label: "Campus or branch name",
            placeholder: "e.g. Downtown Campus",
            type: "text",
            hint: "Displayed in the workspace header and event registrations.",
          },
          {
            id: "serviceTimes",
            label: "Service schedule",
            placeholder: "e.g. Sunday 8am, 10am",
            rows: 3,
            hint: "Used for reminders and check-in windows.",
          },
          {
            id: "ministries",
            label: "Ministries or care units",
            placeholder: "e.g. Ushers, children, prayer, follow-up",
            rows: 3,
            hint: "Used to route requests and assign follow-up.",
          },
        ],
        choiceGroups: [
          {
            id: "church-focus",
            label: "Choose your first live workflows",
            type: "multi",
            hint: "We will surface these first on the home screen.",
            options: [
              { id: "checkin", label: "Child check-in" },
              { id: "giving", label: "Giving" },
              { id: "firstTimers", label: "First timers" },
              { id: "care", label: "Pastoral care" },
            ],
          },
        ],
      },
      {
        eyebrow: "Member care",
        title: "Define follow-up and care",
        description: "These settings create the first care queues and new-guest capture defaults.",
        fields: [
          {
            id: "firstTimerFields",
            label: "First-timer details to collect",
            placeholder: "e.g. Phone, age range, prayer needs, invited by",
            rows: 3,
            hint: "Used in visitor forms and follow-up cards.",
          },
          {
            id: "childGroups",
            label: "Child check-in age groups",
            placeholder: "e.g. 0-2, 3-5, 6-9, 10-12",
            rows: 3,
            hint: "Used to create check-in group labels.",
          },
        ],
        choiceGroups: [
          {
            id: "care-routing",
            label: "Prayer and care requests should go to",
            type: "single",
            hint: "This becomes the default owner for incoming requests.",
            options: [
              { id: "pastoral", label: "Pastoral team" },
              { id: "careUnit", label: "Care unit" },
              { id: "campusLead", label: "Campus lead" },
            ],
          },
        ],
      },
    ],
  },
  store: {
    title: "StoreFront",
    detail: "Catalogs, invoices, payment links, orders, and stock tracking.",
    accentClass: "setup-panel--store",
    summary: [
      "Product, stock, and order defaults",
      "Payment and invoice flow",
      "Customer details and fulfillment rules",
    ],
    sharedFieldOverrides: {
      orgName: { placeholder: "e.g. Cedar Lane Store" },
      adminName: { placeholder: "e.g. Maya Chen" },
      email: { placeholder: "e.g. hello@cedarlanestore.com" },
      role: { placeholder: "e.g. Store Manager" },
      location: { placeholder: "e.g. Vancouver, Canada" },
    },
    sections: [
      {
        eyebrow: "Store profile",
        title: "Set up your selling flow",
        description: "These details shape catalog structure, checkout fields, and payment links.",
        fields: [
          {
            id: "catalogType",
            label: "Product categories",
            placeholder: "e.g. Apparel, books, gift items",
            rows: 3,
            hint: "These become your first catalog sections.",
          },
          {
            id: "stockLocations",
            label: "Stock locations",
            placeholder: "e.g. Main stockroom, showroom, pickup shelf",
            rows: 3,
            hint: "Used for stock counts and release tracking.",
          },
        ],
        choiceGroups: [
          {
            id: "store-focus",
            label: "What should go live first?",
            type: "multi",
            hint: "We will prioritize these tools in your default workspace.",
            options: [
              { id: "catalog", label: "Catalog" },
              { id: "invoices", label: "Invoices" },
              { id: "payments", label: "Payment links" },
              { id: "stock", label: "Stock tracking" },
            ],
          },
          {
            id: "fulfillment",
            label: "How do customers receive orders?",
            type: "single",
            hint: "Used in order status flows and checkout steps.",
            options: [
              { id: "pickup", label: "Pickup" },
              { id: "delivery", label: "Delivery" },
              { id: "hybrid", label: "Both" },
            ],
          },
        ],
      },
      {
        eyebrow: "Customer details",
        title: "Set customer and payment defaults",
        description: "Choose the data Chertt should collect whenever an order is created.",
        fields: [
          {
            id: "customerFields",
            label: "Customer details to collect",
            placeholder: "e.g. Phone, address, order notes",
            rows: 3,
            hint: "These become the default customer form fields.",
          },
          {
            id: "paymentProviders",
            label: "Payment link providers",
            placeholder: "e.g. Paystack, Flutterwave, Stripe",
            rows: 3,
            hint: "Used for payment-link options until a provider is connected.",
          },
        ],
      },
    ],
  },
  events: {
    title: "Events",
    detail: "Invitations, RSVP, ticketing, access control, and guest flow.",
    accentClass: "setup-panel--events",
    summary: [
      "Registration and RSVP structure",
      "Ticketing and access defaults",
      "Guest updates before arrival",
    ],
    sharedFieldOverrides: {
      orgName: { placeholder: "e.g. Aurora Event House" },
      adminName: { placeholder: "e.g. Sofia Martins" },
      email: { placeholder: "e.g. team@auroraevents.co" },
      role: { placeholder: "e.g. Event Director" },
      location: { placeholder: "e.g. Lisbon, Portugal" },
    },
    sections: [
      {
        eyebrow: "Event operations",
        title: "Set up your event flow",
        description: "These answers shape registration forms, ticketing, and check-in on day one.",
        fields: [
          {
            id: "eventTypes",
            label: "Event types you run",
            placeholder: "e.g. Conference, wedding, church event, VIP dinner",
            rows: 3,
            hint: "Used to create starter event templates.",
          },
        ],
        choiceGroups: [
          {
            id: "event-focus",
            label: "Choose the core tools to launch first",
            type: "multi",
            hint: "These become the featured actions inside the Events workspace.",
            options: [
              { id: "registration", label: "Registration" },
              { id: "rsvp", label: "RSVP" },
              { id: "tickets", label: "Ticketing" },
              { id: "checkin", label: "QR check-in" },
            ],
          },
          {
            id: "ticketMode",
            label: "What kind of events do you run?",
            type: "single",
            hint: "Used to pre-configure pricing and ticket states.",
            options: [
              { id: "free", label: "Free events" },
              { id: "paid", label: "Paid events" },
              { id: "mixed", label: "Both" },
            ],
          },
        ],
      },
      {
        eyebrow: "Guest communication",
        title: "Define guest data and arrival notes",
        description: "These fields become your default invite, RSVP, and check-in information.",
        fields: [
          {
            id: "guestFields",
            label: "Guest details to collect",
            placeholder: "e.g. Phone, seat/table, company, dietary notes",
            rows: 3,
            hint: "Used for registration and RSVP forms.",
          },
          {
            id: "guestInfo",
            label: "Arrival information",
            placeholder: "e.g. Parking, table details, venue notes",
            rows: 4,
            hint: "Included in reminders and ticket messages.",
          },
        ],
      },
    ],
  },
};

function renderField(field: FieldConfig) {
  const required = field.id === "orgName" || field.id === "adminName" || field.id === "email";

  if ("options" in field) {
    return (
      <label className="setup-field" key={field.id}>
        <span>{field.label}</span>
        <select defaultValue="" name={field.id} required={required}>
          <option disabled value="">
            {field.placeholder}
          </option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {field.hint ? <small>{field.hint}</small> : null}
      </label>
    );
  }

  if ("rows" in field) {
    return (
      <label className="setup-field setup-field--full" key={field.id}>
        <span>{field.label}</span>
        <textarea name={field.id} placeholder={field.placeholder} rows={field.rows} />
        {field.hint ? <small>{field.hint}</small> : null}
      </label>
    );
  }

  return (
    <label className="setup-field" key={field.id}>
      <span>{field.label}</span>
      <input name={field.id} placeholder={field.placeholder} required={required} type={field.type ?? "text"} />
      {field.hint ? <small>{field.hint}</small> : null}
    </label>
  );
}

function ChoiceGroup({
  config,
  selections,
  onToggle,
}: {
  config: ChoiceGroupConfig;
  selections: string[];
  onToggle: (groupId: string, optionId: string, type: ChoiceGroupConfig["type"]) => void;
}) {
  return (
    <div className="setup-choice-group">
      <p className="setup-choice-group__label">{config.label}</p>
      {config.hint ? <p className="setup-choice-group__hint">{config.hint}</p> : null}
      <div className="setup-chip-grid">
        {config.options.map((option) => {
          const selected = selections.includes(option.id);
          return (
            <button
              key={option.id}
              className={clsx("setup-chip", selected && "is-selected")}
              onClick={() => onToggle(config.id, option.id, config.type)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SetupForm({ selectedModule }: { selectedModule: ModuleKey }) {
  const router = useRouter();
  const config = moduleConfigs[selectedModule];
  const sharedFieldsForModule = getSharedFields(selectedModule);
  const [choices, setChoices] = useState<Record<string, string[]>>({
    "ops-focus": ["documents", "approvals"],
    "approval-style": ["sequential"],
    "church-focus": ["giving", "checkin"],
    "care-routing": ["pastoral"],
    "store-focus": ["catalog", "payments"],
    fulfillment: ["hybrid"],
    "event-focus": ["registration", "checkin"],
    ticketMode: ["mixed"],
  });

  useEffect(() => {
    let cancelled = false;

    async function requireSession() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          router.replace("/auth/sign-in");
        }
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!cancelled && !session) {
        router.replace("/auth/sign-in");
      }
    }

    void requireSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function toggleChoice(groupId: string, optionId: string, type: ChoiceGroupConfig["type"]) {
    setChoices((current) => {
      const existing = current[groupId] ?? [];
      const nextValues =
        type === "single"
          ? [optionId]
          : existing.includes(optionId)
            ? existing.filter((item) => item !== optionId)
            : [...existing, optionId];

      return {
        ...current,
        [groupId]: nextValues,
      };
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const fields = Object.fromEntries(Array.from(formData.entries()).map(([key, value]) => [key, String(value).trim()]));

    saveOnboardingDraft({
      selectedModule,
      fields,
      choices,
      savedAt: new Date().toISOString(),
    });

    router.push(`/auth/creating?module=${selectedModule}`);
  }

  return (
    <main className="setup-screen">
      <form className={clsx("setup-panel", config.accentClass)} onSubmit={handleSubmit}>
        <div className="setup-panel__topbar">
          <BrandMark compact />
          <span className="setup-panel__step">Step 2 of 3</span>
        </div>

        <div className="setup-panel__intro">
          <div>
            <p className="setup-panel__eyebrow">Workspace onboarding</p>
            <h1>Set up your {config.title} workspace.</h1>
            <p>Give Chertt the details it needs to create the right defaults for your team, records, and workflows.</p>
          </div>
          <div className="setup-module-card">
            <span className="setup-module-card__label">Selected module</span>
            <strong>{config.title}</strong>
            <p>{config.detail}</p>
            <ul className="setup-module-card__list">
              {config.summary.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <section className="setup-section">
          <div className="setup-section__header">
            <p className="setup-panel__eyebrow">Shared basics</p>
            <h2>Workspace basics</h2>
            <p>These details create the workspace profile and your primary admin account.</p>
          </div>
          <div className="setup-form-grid">{sharedFieldsForModule.map((field) => renderField(field))}</div>
        </section>

        {config.sections.map((section) => (
          <section className="setup-section" key={section.title}>
            <div className="setup-section__header">
              <p className="setup-panel__eyebrow">{section.eyebrow}</p>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </div>

            {section.fields?.length ? <div className="setup-form-grid">{section.fields.map((field) => renderField(field))}</div> : null}

            {section.choiceGroups?.length ? (
              <div className="setup-choice-stack">
                {section.choiceGroups.map((group) => (
                  <ChoiceGroup
                    key={group.id}
                    config={group}
                    onToggle={toggleChoice}
                    selections={choices[group.id] ?? []}
                  />
                ))}
              </div>
            ) : null}
          </section>
        ))}

        <div className="setup-panel__actions">
          <button className="button button--primary setup-panel__button" type="submit">
            Continue
          </button>
          <Link className="button button--ghost setup-panel__button" href="/auth/modules">
            Back
          </Link>
        </div>
      </form>
    </main>
  );
}
