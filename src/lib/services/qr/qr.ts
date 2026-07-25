// QR foundation: turn a use case into a wa.me deep link + poster copy. Pure and
// I/O-free so it's trivially testable; the route layer generates the image and
// renders the page. Chertt is WhatsApp-first, so every QR just pre-fills a
// message the existing agent already understands — new props cost only a new
// preset. See docs/superpowers/specs/2026-07-25-qr-codes-design.md

// Chertt's dialable WhatsApp business number (digits only, international format,
// no "+"). Overridable per environment; falls back to the current demo number
// so the poster works on deploy with no configuration.
export function cherttNumber(): string {
  const raw = (process.env.WHATSAPP_DISPLAY_NUMBER ?? "").replace(/\D/g, "");
  return raw || "2349117747777";
}

// Builds a wa.me deep link that opens WhatsApp with `text` pre-filled.
export function buildWaLink(text: string, number: string = cherttNumber()): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export type QrPoster = { waText: string; title: string; subtitle: string };

export type PosterParams = {
  preset?: string;
  text?: string;
  title?: string;
  subtitle?: string;
  code?: string;
};

// The presets — each maps to a pre-filled message plus poster copy. `pickup`
// folds in a child's pickup code so a printed tag becomes scan-to-verify.
const PRESETS: Record<string, (p: PosterParams) => QrPoster> = {
  join: () => ({
    waText: "Hi",
    title: "Set up your church in 10 seconds",
    subtitle: "Scan, say hi, and Chertt sets you up.",
  }),
  kids: () => ({
    waText: "Check in my child",
    title: "Children's check-in",
    subtitle: "Scan to check your child in for service.",
  }),
  pickup: (p) => {
    const code = (p.code ?? "").replace(/\D/g, "").slice(0, 6);
    return {
      waText: code ? `Pickup code ${code}` : "Pickup code",
      title: "Child pickup",
      subtitle: code ? "Scan this tag to collect your child." : "Add ?code=XXXXXX to embed the pickup code.",
    };
  },
  parking: () => ({
    waText: "I need parking help",
    title: "Parking & directions",
    subtitle: "Scan for help with parking or getting in.",
  }),
  give: () => ({
    waText: "I want to give",
    title: "Give to the church",
    subtitle: "Scan to give your tithe or offering.",
  }),
  prayer: () => ({
    waText: "I'd like prayer",
    title: "Need prayer?",
    subtitle: "Scan and share your request, privately.",
  }),
  events: () => ({
    waText: "What events are coming up?",
    title: "What's on",
    subtitle: "Scan to see upcoming events and register.",
  }),
};

export const DEFAULT_PRESET = "join";

// Resolves URL params to poster copy. A custom `text` always wins; otherwise the
// named preset; unknown/missing preset falls back to `join` — never a blank page.
export function resolvePoster(params: PosterParams): QrPoster {
  const custom = (params.text ?? "").trim();
  if (custom) {
    return {
      waText: custom,
      title: (params.title ?? "").trim() || "Scan to chat with Chertt",
      subtitle: (params.subtitle ?? "").trim() || "Scan to open WhatsApp.",
    };
  }
  const key = (params.preset ?? "").trim().toLowerCase();
  const build = PRESETS[key] ?? PRESETS[DEFAULT_PRESET];
  const base = build(params);
  // Allow copy overrides even on a preset.
  return {
    waText: base.waText,
    title: (params.title ?? "").trim() || base.title,
    subtitle: (params.subtitle ?? "").trim() || base.subtitle,
  };
}

// Drives the gallery index at /qr.
export const PRESET_LIST: Array<{ id: string; title: string; blurb: string }> = [
  { id: "join", title: "Join / Onboard", blurb: "Scan to set up a church in seconds — the demo showstopper." },
  { id: "kids", title: "Children's check-in", blurb: "Parents scan at the kids' door to check a child in." },
  { id: "pickup", title: "Child pickup tag", blurb: "Per-child tag (add ?code=) — scan to verify at collection." },
  { id: "parking", title: "Parking & directions", blurb: "Scan at the gate for parking help." },
  { id: "give", title: "Giving", blurb: "Scan to give a tithe or offering." },
  { id: "prayer", title: "Prayer", blurb: "Scan to share a prayer request privately." },
  { id: "events", title: "Events", blurb: "Scan to see what's on and register." },
];
