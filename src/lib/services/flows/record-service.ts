// Service-record rail (Phase 3, secretary/pastor) — captures a Sunday/midweek
// service report field by field → record_service_summary. Rank-gated (minRank 2);
// re-checks toolAccessError before committing. Optional fields are skippable so a
// quick report is fast; adults is the one headline number we ask for.
import type { FlowDefinition, FlowInput, FlowData, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import type { Role } from "@/lib/types";

const SERVICE_TYPES = [
  { id: "st_sunday", title: "Sunday Service" },
  { id: "st_midweek", title: "Midweek" },
  { id: "st_vigil", title: "Vigil" },
  { id: "st_other", title: "Other" },
];
const typeRows = () => SERVICE_TYPES.map((s) => ({ id: s.id, title: s.title }));
const SKIP = [{ id: "flow_skip", title: "Skip" }];

// Parse a count (≥0) from text, or null if not a valid number.
function count(text: string): number | null {
  const n = Number(text.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

// A skippable numeric step: Skip → null; a valid number → next; else re-ask.
function numStep(header: string, prompt: string, field: string, next: string): FlowDefinition["steps"][string] {
  return {
    render: () => ({ type: "buttons", header, text: prompt, buttons: SKIP }),
    onInput: (input): Transition => {
      if (input.buttonId === "flow_skip") return { to: next, patch: { [field]: null } };
      const n = count(input.text);
      if (n === null) return { stay: { type: "buttons", header, text: `Send a number, or tap *Skip*.`, buttons: SKIP } };
      return { to: next, patch: { [field]: n } };
    },
  };
}

// A skippable free-text step.
function textStep(header: string, prompt: string, field: string, next: string): FlowDefinition["steps"][string] {
  return {
    render: () => ({ type: "buttons", header, text: prompt, buttons: SKIP }),
    onInput: (input): Transition => {
      if (input.buttonId === "flow_skip") return { to: next, patch: { [field]: null } };
      return { to: next, patch: { [field]: input.text.trim() || null } };
    },
  };
}

const H = "Service report";

export const recordServiceFlow: FlowDefinition = {
  name: "service_record",
  firstStep: "service_type",
  steps: {
    service_type: {
      render: () => ({ type: "list", header: H, text: "Let's record today's service. Which service is this?", buttonLabel: "Choose", rows: typeRows() }),
      onInput: (input: FlowInput): Transition => {
        const chosen = SERVICE_TYPES.find((s) => s.id === input.buttonId);
        if (!chosen) return { stay: { type: "list", header: H, text: "Tap the service type.", buttonLabel: "Choose", rows: typeRows() } };
        return { to: "adults", patch: { serviceType: chosen.title } };
      },
    },
    adults: {
      render: () => ({ type: "text", text: "How many *adults* attended? Send a number." }),
      onInput: (input): Transition => {
        const n = count(input.text);
        if (n === null) return { stay: { type: "text", text: "Send the adult attendance as a number, e.g. 120." } };
        return { to: "children", patch: { adults: n } };
      },
    },
    children: numStep(H, "How many *children*? Send a number, or tap *Skip*.", "children", "first_timers"),
    first_timers: numStep(H, "How many *first-timers*? Send a number, or tap *Skip*.", "firstTimers", "salvations"),
    salvations: numStep(H, "How many *salvations / decisions*? Send a number, or tap *Skip*.", "salvations", "offering"),
    offering: numStep(H, "*Offering total* (₦)? Send a number, or tap *Skip*.", "offering", "preacher"),
    preacher: textStep(H, "Who *preached*? Type a name, or tap *Skip*.", "preacher", "topic"),
    topic: textStep(H, "*Message / sermon topic*? Type it, or tap *Skip*.", "topic", "confirm"),
    confirm: {
      render: (data) => {
        const line = (label: string, v: unknown) => (v === null || v === undefined || v === "" ? null : `${label}: ${typeof v === "number" ? v.toLocaleString("en-NG") : String(v)}`);
        const bits = [
          line("Service", data.serviceType),
          line("Adults", data.adults),
          line("Children", data.children),
          line("First-timers", data.firstTimers),
          line("Salvations", data.salvations),
          line("Offering ₦", data.offering),
          line("Preacher", data.preacher),
          line("Topic", data.topic),
        ].filter(Boolean);
        return {
          type: "buttons",
          header: "Confirm service report",
          text: `${bits.join("\n")}\n\nSave this report?`,
          buttons: [{ id: "sr_go", title: "✅ Save" }, { id: "sr_cancel", title: "❌ Cancel" }],
        };
      },
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "sr_cancel") return { done: { type: "text", text: "No problem — nothing saved. 🙏" } };
        if (input.buttonId !== "sr_go" && !/^(yes|y|save|confirm)$/i.test(input.text.trim())) {
          return { stay: { type: "buttons", header: "Confirm service report", text: "Tap *Save* to record it, or *Cancel*.", buttons: [{ id: "sr_go", title: "✅ Save" }, { id: "sr_cancel", title: "❌ Cancel" }] } };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("record_service_summary");
        if (!tool) return { done: { type: "text", text: "Service recording is unavailable right now — please try again shortly." } };
        const denied = toolAccessError(tool, { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role });
        if (denied) return { done: { type: "text", text: denied } };
        const res = (await tool.handler(
          {
            serviceType: data.serviceType,
            adults: data.adults ?? undefined,
            children: data.children ?? undefined,
            firstTimers: data.firstTimers ?? undefined,
            salvations: data.salvations ?? undefined,
            offering: data.offering ?? undefined,
            preacher: data.preacher ?? undefined,
            topic: data.topic ?? undefined,
          },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't save it: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "✅ Service report saved." } };
      },
    },
  },
};
