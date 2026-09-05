// Life-journey rail (Phase 2) — one rail that branches by type into the four
// member-facing intakes: baptism, new-believer discipleship, marriage prep, and
// bereavement. Each just captures the request and flags a pastor to follow up.
// pick type → one tailored (optional) detail → commit via the matching tool.
import type { FlowDefinition, FlowInput, FlowData, FlowRunContext, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

// Marriage counselling intentionally lives in the pastoral-FORM rail
// (pre_marital), alongside the other intake forms — not here — so there's one
// canonical entry per intent. Life-journeys stay about spiritual-state journeys.
type JourneyType = "baptism" | "discipleship" | "bereavement";

const TYPES: Array<{ id: JourneyType; label: string }> = [
  { id: "baptism", label: "💧 Baptism" },
  { id: "discipleship", label: "🙌 New believer" },
  { id: "bereavement", label: "🕊️ Bereavement" },
];

// ≤3 options → tappable buttons (one tap, no modal), per the directness rule.
const typeButtons = () => TYPES.map((t) => ({ id: `lj_${t.id}`, title: t.label }));

// Per-type detail prompt + the button (Me for self-default types, Skip otherwise).
const DETAIL: Record<JourneyType, { text: string; button: { id: string; title: string } }> = {
  baptism: { text: "Who's being baptised? Type a name, or tap *Me*.", button: { id: "lj_me", title: "Me" } },
  discipleship: { text: "Who's the new believer? Type a name, or tap *Me*.", button: { id: "lj_me", title: "Me" } },
  bereavement: { text: "Anything you'd like to share — who passed, and your relationship? Type it, or tap *Skip*.", button: { id: "flow_skip", title: "Skip" } },
};

// Route the (optional) detail text into the right tool + args.
async function commit(journeyType: JourneyType, detail: string, ctx: FlowRunContext): Promise<Transition> {
  if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
  const toolByType: Record<JourneyType, string> = {
    baptism: "register_baptism",
    discipleship: "enroll_discipleship",
    bereavement: "start_bereavement_support",
  };
  const tool = getAgentTool(toolByType[journeyType]);
  if (!tool) return { done: { type: "text", text: "That's unavailable right now — please try again shortly." } };
  const d = detail.trim();
  const argsByType: Record<JourneyType, Record<string, unknown>> = {
    baptism: { candidate: d || undefined },
    discipleship: { convert: d || undefined },
    bereavement: { notes: d || undefined },
  };
  const res = (await tool.handler(
    argsByType[journeyType],
    { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
  )) as { message?: string; error?: string };
  if (res.error) return { done: { type: "text", text: `Couldn't do that: ${res.error}` } };
  return { done: { type: "text", text: res.message ?? "Done — a pastor will follow up. 🙏" } };
}

export const lifeJourneyFlow: FlowDefinition = {
  name: "life_journey",
  firstStep: "journey_type",
  steps: {
    journey_type: {
      render: () => ({
        type: "buttons",
        header: "Life journeys",
        text: "What would you like to start? A pastor will follow up with you.",
        buttons: typeButtons(),
      }),
      onInput: (input: FlowInput): Transition => {
        const m = /^lj_(\w+)$/.exec(input.buttonId ?? "");
        const chosen = m ? TYPES.find((t) => t.id === m[1]) : undefined;
        if (!chosen) {
          return { stay: { type: "buttons", header: "Life journeys", text: "Tap one of the options below.", buttons: typeButtons() } };
        }
        return { to: "detail", patch: { journeyType: chosen.id } };
      },
    },
    detail: {
      render: (data) => {
        const jt = data.journeyType as JourneyType;
        const d = DETAIL[jt];
        return { type: "buttons", header: "Life journeys", text: d.text, buttons: [d.button] };
      },
      onInput: async (input, data, ctx): Promise<Transition> => {
        const jt = data.journeyType as JourneyType;
        // "Me" (self-default) and "Skip" both mean "no detail" — let the tool default.
        const detail = input.buttonId === "lj_me" || input.buttonId === "flow_skip" ? "" : input.text.trim();
        return commit(jt, detail, ctx);
      },
    },
  },
};
