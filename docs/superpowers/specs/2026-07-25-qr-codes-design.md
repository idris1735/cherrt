# QR Codes — Design Spec

**Date:** 2026-07-25
**Status:** Approved (brainstorming) — build directly, no separate plan doc (per user).
**Goal:** Generate branded, printable QR-code posters that launch WhatsApp with a pre-filled message, so scanning a code drops someone straight into a Chertt flow (onboarding, kids check-in/pickup, parking, giving, prayer, events) with no app and no login.

## Core Insight

Chertt is WhatsApp-first, so the most powerful QR is not a form — it's a **`wa.me/<number>?text=<message>` deep link**. On scan: WhatsApp opens with the message pre-filled → the user sends it → the **existing agent** handles it. The only thing that varies between use cases is the pre-filled `text`. Therefore we build **one param-driven QR poster route**; every use case is a different query string, and future props cost almost nothing.

## Scope

**Build now (comprehensive foundation + presets):**
- A pure deep-link + preset library.
- Server-rendered QR generation (no external calls).
- A single route `/qr` that renders either a **poster** (given a preset or custom text) or a **gallery** (no params) listing every preset.
- Presets: `join` (default), `kids`, `pickup`, `parking`, `give`, `prayer`, `events`.
- Custom override via `?text=`, `?title=`, `?subtitle=`.
- Print-friendly styling + a Print button.

**Bonuses included (worth it, low cost):**
- **Gallery index** at `/qr` so an admin sees and opens every poster.
- **`pickup` preset** takes `?code=` to embed a child's pickup code (`Pickup code 482913`) — turns a printed child tag into a scan-to-verify.
- **Print stylesheet** so posters print clean (QR + headline only, no chrome).
- **Downloadable** — the QR is a real `<img>` a user can long-press/save.

**Deferred (roadmap, same foundation):**
- Sending a QR *into* WhatsApp as an image (needs Cloud API media upload).
- Dynamic per-workspace numbers (multi-tenant) — v1 uses one business number.
- Scan analytics.

## Architecture

```
/qr?preset=join                    → poster: QR of wa.me/<num>?text=Hi
/qr?preset=pickup&code=482913      → poster: QR of ...?text=Pickup%20code%20482913
/qr?text=Custom%20thing&title=...  → poster with custom message
/qr                                → gallery of all presets
```

- **`src/lib/services/qr/qr.ts`** (pure, unit-tested):
  - `cherttNumber(): string` — `process.env.WHATSAPP_DISPLAY_NUMBER` (digits only), fallback `"2349117747777"`.
  - `buildWaLink(text: string, number?: string): string` — `https://wa.me/<number>?text=<encodeURIComponent(text)>`.
  - `type QrPoster = { waText: string; title: string; subtitle: string };`
  - `PRESETS: Record<string, (params) => QrPoster>` — the seven presets.
  - `resolvePoster(params: { preset?: string; text?: string; title?: string; subtitle?: string; code?: string }): QrPoster` — custom `text` wins; else the named preset; else `join`.
  - `PRESET_LIST: Array<{ id: string; title: string; blurb: string }>` — drives the gallery.
- **`src/lib/services/qr/qr-image.ts`**: `qrDataUrl(text: string): Promise<string>` — wraps `qrcode.toDataURL` (width 1000, margin 2, dark `#0b3d2e`, light `#ffffff`). Server-only.
- **`src/app/qr/page.tsx`**: async server component. Reads `searchParams` (Next 16 = `Promise`). No `preset`/`text` → `<Gallery/>`; else resolve poster, generate QR data URL, render `<Poster/>`.
- **`src/app/qr/poster.tsx`**: presentational poster (QR image, headline, 3-step instructions, Chertt wordmark, Print button). Print CSS hides chrome.
- **`src/app/qr/gallery.tsx`**: cards for each preset linking to `/qr?preset=<id>`.

**Dependency:** add `qrcode` + `@types/qrcode`.

## Copy (WhatsApp-safe, warm)

- **join** — title "Set up your church in 10 seconds", subtitle "Scan, say hi, and Chertt sets you up.", text `Hi`.
- **kids** — "Children's check-in", "Scan to check your child in for service.", text `Check in my child`.
- **pickup** — "Child pickup", "Scan this tag to collect your child.", text `Pickup code <code>` (code from `?code=`, else prompts).
- **parking** — "Parking & directions", "Scan for help with parking or getting in.", text `I need parking help`.
- **give** — "Give to the church", "Scan to give your tithe or offering.", text `I want to give`.
- **prayer** — "Need prayer?", "Scan and share your request, privately.", text `I'd like prayer`.
- **events** — "What's on", "Scan to see upcoming events and register.", text `What events are coming up?`.

## Visual Design

Print-first poster on white: a large centered QR (church-green modules), a bold headline, a three-step "Point your camera → tap the link → say hi" strip, and a quiet "Powered by Chertt" wordmark. Single-theme (posters are printed) — deliberate, not an omission. Gallery is a simple responsive card grid.

## Error Handling

- Unknown preset → falls back to `join` (never a blank page).
- `pickup` without `code` → still renders, text becomes `Pickup code` (agent will ask for the code) and the subtitle notes to add `?code=`.
- QR generation failure → render the poster with the raw `wa.me` link as tappable text, so the page is never broken.

## Testing

- `qr.test.ts`: `buildWaLink` uses the number and URL-encodes text (spaces, `#`, unicode); `cherttNumber` honors env and falls back; `resolvePoster` — custom text wins, each preset maps to the right `waText`/copy, `pickup` embeds the code, unknown preset → `join`.
- Full suite + `tsc --noEmit` stay green.

## Reversibility / Config

Set `WHATSAPP_DISPLAY_NUMBER` (digits only, e.g. `2349117747777`) in the environment for production. With it unset the code falls back to the current demo number so the page works on deploy with no config.

## Files

**New:** `src/lib/services/qr/qr.ts` (+ test), `src/lib/services/qr/qr-image.ts`, `src/app/qr/page.tsx`, `src/app/qr/poster.tsx`, `src/app/qr/gallery.tsx`.
**Modified:** `package.json` (add `qrcode`, `@types/qrcode`).
