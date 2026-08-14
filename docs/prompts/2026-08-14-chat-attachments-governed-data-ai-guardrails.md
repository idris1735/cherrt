# DeepSeek Prompt — Persisted chat data, governed flexible attributes, AI guardrails, QR/code safety

> Direction by Claude. This is a **high-stakes domain — money, children, PII, NDPR.** The guiding rule is **governed flexibility, not unlimited power**: the AI gets richer memory and reach, but inside schemas *we* design, with hard rails it can't drift past. Build the *safe* versions of "never lose data" and "smart AI." TDD every service/tool; `tsc` + `build` + full suite green; per-slice commits; update `CHRONICLE.md`. Never weaken the consent gate, opt-out suppression, or the never-pray/refer-to-human rules.

Order: **WS-A → WS-D → WS-B → WS-C** (attachments first — a concrete data-loss gap; then child-pickup safety; then governed attributes; then codify the guardrails).

---

## WS-A — Persist chat attachments (close the "AI collected it but nothing's on file" gap)
Today a photo/voice-note/document sent over WhatsApp is downloaded, passed to the AI **in memory, then discarded** — so "save this to my record" saves nothing.
- **Migration:** `chat_attachments` (`id`, `workspace_id`, `person_id`, `kind` ∈ image/document/audio/other, `storage_path`, `mime_type`, `caption`, `source` default 'whatsapp', `created_at`). RLS deny-all.
- **Private bucket** `chat-attachments` (mirror the `kyc` bucket + signed-URL helpers in `kyc/storage.ts`).
- **Wire into the processor:** on inbound media, download from Meta, upload to `chat-attachments/{workspaceId}/{personId}/{id}.{ext}`, insert a row. **Best-effort — never block the reply.** Voice notes: keep both the audio file AND the transcript.
- **Tools:** `save_attachment` (links/confirms the latest attachment to the person's record) and `list_attachments(personId)` (leaders only, `dataSensitive`). The AI must reference *real stored* attachments — never claim it saved something it didn't.
- **Consent:** only for consented people (first-contact gate already covers this). Respect opt-out.
- **Acceptance:** a photo sent in chat lands in the bucket + a `chat_attachments` row; "save this to my record" genuinely persists + confirms; a leader can list a person's files. TDD the store path + the "never claim a phantom save" behavior.

## WS-D — Children QR / pickup + church-code safety (the hardening the code itself flags)
Child safety is non-negotiable — these are the follow-ups noted in `child-tools.ts`:
- **Rate-limit** `lookup_child_pickup` and `release_child` per phone + per workspace, so a 6-digit pickup code can't be brute-forced (e.g. lock after 5 wrong attempts in 10 min; log to `whatsapp_send_logs`/a flags table).
- **Bind release to guardian identity:** `release_child` must require the requester's WhatsApp number to match a **registered guardian with `can_pickup = true`** — not code-only. The code is a convenience, the guardian match is the gate. Keep the existing confirmation step.
- **Indexed join-code:** replace the derive-from-UUID-and-scan join code with a **stored unique `join_code` column** on `workspaces` (generated at creation, indexed), and backfill existing workspaces with their current derived code so live codes keep working. Lookups become an indexed query, not a full-table scan.
- **Acceptance:** repeated wrong pickup attempts get throttled; `release_child` refuses a non-guardian *even with the correct code*; join-by-code is an indexed lookup and existing codes still resolve. TDD each.

## WS-B — Governed flexible attributes (rich data, zero schema chaos)
Give the AI a place for the long tail of facts **without inventing columns**.
- **Migration:** a `person_attributes` table (`person_id`, `workspace_id`, `key`, `value`, `category` ∈ normal/special, `source`, `created_at`, unique on person+key) — or `attributes jsonb` on `people`. RLS deny-all.
- **Service:** `setAttribute({ personId, key, value, category, consentedSpecial? })`, `getAttributes(personId)`. Keys normalized to snake_case.
- **HARD GUARDRAIL — special-category data:** a `SPECIAL_CATEGORIES` classifier (health, religion, ethnicity, political opinion, sexual orientation, biometric). `setAttribute` **refuses** to store anything classified special unless `consentedSpecial === true` AND it tags `category: 'special'`. No exceptions.
- **Core stays typed:** name, phone, email, gender, DOB, address, roles, giving, verification live in their real validated columns — attributes is the *extra tail only*, never a substitute. The AI is told this.
- **Persona:** the AI records useful extras as attributes ("prefers Yoruba service", "ushers on Sundays", "night-shift nurse — schedule around it") but obeys the special-category rule and routes core fields to their real homes.
- **Acceptance:** the AI can store & recall an extra fact; `setAttribute` **refuses a health fact without special consent** (test this explicitly); core data is never shoved into attributes.

## WS-C — Codify the AI-power boundaries (governance, not a blank cheque)
Make the rails explicit in code + persona so they can't drift:
- **No dynamic schema creation.** The AI never creates tables/columns — only the governed attributes bag (WS-B).
- **Bounded loops only.** Keep the step-capped tool loop + scheduled jobs; add/verify a hard max-tool-calls guard per turn. No unbounded self-prompting.
- **Confirmation gates on consequential/irreversible actions:** spending or collecting money, messaging everyone, releasing a child, and writing special-category data. Ensure every such tool is gated (persona already covers most — lock it with tests).
- **Acceptance:** tests that money/broadcast/child-release/special-write each require confirmation; a test that the agent loop cannot exceed its cap.

---

## Rules
TDD everything; report per WS what you built and **how you tested the guardrails** — especially WS-D's pickup-code protection (non-guardian refused with a valid code) and WS-B's special-category refusal. Claude will audit these two specifically. Keep the domain principle front of mind: **helpful and sharp, inside hard rails — never autonomous over money, minors, or PII.**
