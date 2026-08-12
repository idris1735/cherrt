# DeepSeek Prompt — Sign-in fix + Phase-2 finish

> Direction by Claude (from review). Read `CHRONICLE.md` §0 first. **TDD** every service/route (failing test → implement → green); UI verified via `tsc` + `build`. Per-task commits, explicit `git add`, never break the current **424 tests**, update `CHRONICLE.md`. Two independent parts — do **Part A first** (it's demo-blocking), then Part B.

---

## PART A — Fix the admin sign-in (demo-blocking; the web rebuild left this half-done)

**Problem (verified in review):** `/auth/sign-in` renders `<SignInForm>` (`src/components/auth/sign-in-form.tsx`), whose submit handler still runs the **old dual-surface routing** — it pushes to `/w/${slug}/modules/toolkit` and `/auth/setup` (both **deleted → 404**) and only falls through to `/admin` as a last resort. It also depends on `bootstrapWorkspaceFromDraft`, `getOnboardingDraft`, `getLastWorkspaceSlug`, `getFirstWorkspaceSlugForCurrentUser`, `selectedModule`, and a mode toggle. So a returning user with a stale `lastWorkspaceSlug` in localStorage lands on a 404. Plus `src/app/auth/sign-in/page.tsx` links to `/auth/create-account` (deleted), and `src/proxy.ts` is dead middleware redirecting `/w/:path*` → a deleted route.

**Do this:**
1. **Rewrite `src/components/auth/sign-in-form.tsx`** to a minimal admin sign-in — email + password → `supabase.auth.signInWithPassword` → on success `router.push("/admin")` and `router.refresh()`, on failure show the mapped error. **Delete every** workspace/onboarding-draft/module/mode-toggle branch and all `/w/...` and `/auth/setup` pushes. No reads of `getOnboardingDraft`/`bootstrapWorkspaceFromDraft`/`getLastWorkspaceSlug`/`getFirstWorkspaceSlugForCurrentUser`. Keep `mapAuthErrorMessage`.
2. **`src/app/auth/sign-in/page.tsx`** — remove the `/auth/create-account` link (admin accounts are provisioned, not self-served). Keep it a clean single sign-in card.
3. **Delete `src/proxy.ts`** (the `/w` matcher/redirect is dead). If Next 16 requires a proxy/middleware file to exist, reduce it to a bare pass-through with no matcher rewrites.
4. **Prune** any helper module left unused after this (e.g. `onboarding-draft`, workspace-bootstrap, `getFirstWorkspaceSlugForCurrentUser`) — grep for remaining imports first; delete only if truly unreferenced.

**Acceptance (Part A):**
- Signing in with a `PLATFORM_ADMIN_EMAILS` account lands on **`/admin`** — **even with a stale `lastWorkspaceSlug`/onboarding-draft in localStorage** (add a test that seeds those and asserts the redirect target is `/admin`).
- No route in the sign-in path points at `/w/*`, `/auth/setup`, `/auth/create-account`, or any deleted page.
- `tsc` + `build` + full suite green.

---

## PART B — Finish Phase 2 (close the "visible in /admin" acceptance gate)

Phase 2's WhatsApp/data side is complete, but the captured data isn't surfaced in the console and the milestone timeline never populates. Close both.

### B1 — Foundation reads
In `src/lib/services/admin/foundation.ts` (TDD, mocked Supabase):
- **Extend `getChurchDetail(id)`** so each member row includes the richer profile now on `people` (`gender`, `birthdate`, `email`, `marital_status`, `joined_at`) and add a `children` section (from `child_profiles` + `guardianships`, with guardian names) and a `pastoralRequests` count/summary.
- **Add `getPersonDetail(personId)`** → `{ person, memberships: {church, role, unit, verificationLevel}[], guardianOf: {childName, relationship}[], milestones: {type, occurredOn, details}[], pastoralRequests: {...}[] }`. Milestones ordered by `occurred_on` desc.

### B2 — Person detail page + route
- **Route:** `GET /api/admin/people/[id]` — `platformAdminEmail`-gated (same pattern as the other admin routes) → `getPersonDetail`.
- **Page:** `src/app/admin/people/[id]/page.tsx` — profile header + a **milestone timeline** (vertical, most-recent-first), memberships, and "guardian of" children. Use the existing admin design kit (sidebar shell, cards, tables). Link each row in `/admin/people` to its detail page.
- Enrich the **church-detail** members section to show the richer profile fields + a children list.

### B3 — Auto-emit milestones (make the timeline real)
Add a small helper (e.g. `recordMilestone({ personId, workspaceId, type, occurredOn?, details? })` in a `src/lib/services/church/milestones.ts`, or reuse the existing `record_milestone` internals) and call it from:
- `convert_first_timer` → write a `joined_membership` milestone for the new member.
- Completing a `baby_dedication` or `child_naming` pastoral form (`update_pastoral_form_status` → `completed`) → write a `child_dedication` milestone for that submission's `person_id`.
Best-effort (`.catch(() => {})`) — never block the primary action. TDD each.

### B4 — Minor correctness
- `submit_pastoral_form` — use `ensurePerson` (not just `ctx.personId`) so an unlinked submitter still links to a real person.

**Acceptance (Part B):**
- `/admin/people/[id]` shows a person's profile + a populated milestone timeline + their churches/roles + children they guard.
- Church detail shows richer member profiles + children.
- Converting a first-timer and completing a dedication form each add a milestone that appears on the person's timeline.
- `tsc` + `build` + full suite green; new tables already exist (no new migration expected unless you add a column).

---

## Order & gate
Part A → Part B (B1 → B2 → B3 → B4). Each part ends green (its tests + full suite + `tsc` + `build`) and merged to `main`. Report back what changed per part so Claude can review — especially: Part A's redirect test, and that B3's milestones actually fire on convert/complete.
