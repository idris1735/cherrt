# Chat-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 5 most impactful client issues so Chertt feels like a chat app (ChatGPT/Claude-like), not a confusing dashboard.

**Architecture:** All changes are surgical edits to existing files. No new files, no new abstractions. The chat page (`page.tsx`) is the primary target — we fix its behaviour and strip its visual noise. Auth form cleanup is a separate isolated change.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, react-markdown (already installed)

---

## File Map

| File | What changes |
|---|---|
| `src/app/w/[workspaceSlug]/chat/page.tsx` | Remove animation, fix suggestion cards, remove Records panel |
| `src/app/w/[workspaceSlug]/chat/page.module.css` | Remove `.caret`, `.recordsSection`, `.recordsToggle`, `.recordsList`, `.recordsGroup`, `.recordsGroupLabel`, `.recordsItem`, `.recordsItemStatus`, `.recordsEmpty`, `.recordsChevronOpen` CSS |
| `src/components/auth/simple-sign-up-form.tsx` | Remove age field + validation |
| `src/app/auth/create-account/page.tsx` | Update copy to remove age mention |

---

## Task 1: Fix suggestion cards — fill input, don't auto-send

**Client issue:** "The options that appear on top of the text bar open up a chat with the example instead of just filling the text bar." (Critical)

**Files:**
- Modify: `src/app/w/[workspaceSlug]/chat/page.tsx` — `handleSuggestionClick` function (line ~643) and suggestion card `onClick` (line ~968)

- [ ] **Step 1: Change handleSuggestionClick to fill the input only**

Find this in `chat/page.tsx`:
```typescript
function handleSuggestionClick(suggestionPrompt: string) {
  void sendPrompt(suggestionPrompt);
}
```

Replace with:
```typescript
function handleSuggestionClick(suggestionPrompt: string) {
  setPrompt(suggestionPrompt);
  composerRef.current?.focus();
}
```

- [ ] **Step 2: Add composerRef**

At the top of `ChatPage`, alongside `threadRef`, add:
```typescript
const composerRef = useRef<HTMLTextAreaElement>(null);
```

- [ ] **Step 3: Attach composerRef to both textarea elements**

There are two `<textarea>` elements in the page — one in the landing form (inside `landingShell`) and one in the chat form (inside `chatWorkarea`). Add `ref={composerRef}` to both:

Landing form textarea (around line 986):
```tsx
<textarea
  ref={composerRef}
  value={prompt}
  onChange={(e) => setPrompt(e.target.value)}
  onKeyDown={handleComposerKeyDown}
  placeholder="Message Chertt..."
  rows={1}
/>
```

Chat form textarea (around line 1096):
```tsx
<textarea
  ref={composerRef}
  value={prompt}
  onChange={(e) => setPrompt(e.target.value)}
  onKeyDown={handleComposerKeyDown}
  placeholder="Message Chertt..."
  rows={1}
/>
```

- [ ] **Step 4: Start the dev server and verify**

Run: `npm run dev`

1. Open the chat page
2. Tap any suggestion card
3. Confirm: the input bar fills with the suggestion text — nothing is sent yet
4. Edit the text, hit Enter — confirm it sends normally

- [ ] **Step 5: Commit**

```bash
git add src/app/w/\[workspaceSlug\]/chat/page.tsx
git commit -m "fix: suggestion cards fill input bar instead of auto-sending"
```

---

## Task 2: Remove the typewriter animation — static greeting

**Client issue:** "Animation on homepage should be removed and simplified. Follow popular platform interfaces — ChatGPT, Grok, Gemini etc. Focus should be on what the person wants to do — chat." (High)

**Files:**
- Modify: `src/app/w/[workspaceSlug]/chat/page.tsx`
- Modify: `src/app/w/[workspaceSlug]/chat/page.module.css`

- [ ] **Step 1: Remove animation state variables**

Find and delete these two `useState` lines (around line 115-116):
```typescript
const [greetingIndex, setGreetingIndex] = useState(0);
const [greetingChars, setGreetingChars] = useState(0);
```

- [ ] **Step 2: Remove greetingFrames memo**

Find and delete this block (around line 143-150):
```typescript
const greetingFrames = useMemo(
  () => [
    `What can I help with, ${firstName}?`,
    "Draft a letter. Make a report. Raise a request.",
    "Ask Chertt in plain language.",
  ],
  [firstName],
);
```

- [ ] **Step 3: Remove the two animation effects**

Find and delete this effect (resets animation when frames change, around line 208-211):
```typescript
useEffect(() => {
  setGreetingIndex(0);
  setGreetingChars(0);
}, [greetingFrames]);
```

Find and delete this effect (the typewriter ticker, around line 213-225):
```typescript
useEffect(() => {
  const line = greetingFrames[greetingIndex];
  let timeout: ReturnType<typeof setTimeout>;
  if (greetingChars < line.length) {
    timeout = setTimeout(() => setGreetingChars((n) => n + 1), 32);
  } else {
    timeout = setTimeout(() => {
      setGreetingIndex((n) => (n + 1) % greetingFrames.length);
      setGreetingChars(0);
    }, 1700);
  }
  return () => clearTimeout(timeout);
}, [greetingChars, greetingFrames, greetingIndex]);
```

- [ ] **Step 4: Remove animatedGreeting variable**

Find and delete this line (around line 662):
```typescript
const animatedGreeting = greetingFrames[greetingIndex].slice(0, greetingChars);
```

- [ ] **Step 5: Replace animated heading with static heading**

Find this JSX (around line 960-963):
```tsx
<h1>
  {animatedGreeting}
  <span className={styles.caret}>|</span>
</h1>
```

Replace with:
```tsx
<h1>What can I help with?</h1>
```

- [ ] **Step 6: Remove .caret CSS class**

In `chat/page.module.css`, find and delete the `.caret` rule entirely. It looks like:
```css
.caret {
  ...
}
```

- [ ] **Step 7: Verify — no animation, clean heading**

With dev server running:
1. Open a fresh chat (or new conversation)
2. Confirm: heading says "What can I help with?" — static, no typing animation, no blinking cursor
3. Confirm TypeScript compiles: `npm run typecheck`

Expected output from typecheck: no errors

- [ ] **Step 8: Commit**

```bash
git add src/app/w/\[workspaceSlug\]/chat/page.tsx src/app/w/\[workspaceSlug\]/chat/page.module.css
git commit -m "fix: replace typewriter animation with static greeting"
```

---

## Task 3: Remove the Records panel from the sidebar

**Client issue:** "Not sure what this page is for" and "there's a better way to both display this." The sidebar's collapsible Records section exposes internal data structure to the user in a confusing way. Remove it — records are accessible from chat action cards.

**Files:**
- Modify: `src/app/w/[workspaceSlug]/chat/page.tsx`
- Modify: `src/app/w/[workspaceSlug]/chat/page.module.css`

- [ ] **Step 1: Remove recordsOpen state**

Find and delete:
```typescript
const [recordsOpen, setRecordsOpen] = useState(false);
```

- [ ] **Step 2: Remove the Records section JSX**

Find and delete the entire `{/* Records panel */}` block from the sidebar. It starts with:
```tsx
{/* Records panel */}
<div className={styles.recordsSection}>
  <button
    className={styles.recordsToggle}
    onClick={() => setRecordsOpen((o) => !o)}
    type="button"
  >
```

And ends after the closing `</div>` of the `recordsSection` div (after the `recordsOpen ? ... : null` block). Delete the entire section.

- [ ] **Step 3: Remove Records CSS classes from page.module.css**

Find and delete all of these CSS rules from `chat/page.module.css`:
- `.recordsSection { ... }`
- `.recordsToggle { ... }`
- `.recordsChevronOpen { ... }`  
- `.recordsList { ... }`
- `.recordsGroup { ... }`
- `.recordsGroupLabel { ... }`
- `.recordsItem { ... }`
- `.recordsItemStatus { ... }`
- `.recordsEmpty { ... }`

- [ ] **Step 4: Verify sidebar looks clean**

With dev server running:
1. Open chat — confirm sidebar no longer shows the "Records" toggle or list
2. Confirm TypeScript: `npm run typecheck`

Expected: no errors, clean sidebar with just: brand → new chat → history → wallet balance → footer

- [ ] **Step 5: Commit**

```bash
git add src/app/w/\[workspaceSlug\]/chat/page.tsx src/app/w/\[workspaceSlug\]/chat/page.module.css
git commit -m "fix: remove confusing Records panel from sidebar"
```

---

## Task 4: Remove age field from sign-up form

**Client issue:** "Sign up process should be simplified. Email and password. Age not required in sign up." (High)

**Files:**
- Modify: `src/components/auth/simple-sign-up-form.tsx`
- Modify: `src/app/auth/create-account/page.tsx`

- [ ] **Step 1: Remove age state and validation from simple-sign-up-form.tsx**

Find and delete the `age` state line:
```typescript
const [age, setAge] = useState("");
```

Find and delete the `safeAge` line and the age validation block in `handleSubmit`:
```typescript
const safeAge = Number(age);
```
and:
```typescript
if (!Number.isFinite(safeAge) || safeAge < 13 || safeAge > 120) {
  setError("Age must be between 13 and 120.");
  return;
}
```

- [ ] **Step 2: Remove age from signUp options data**

Find this in `handleSubmit`:
```typescript
options: {
  emailRedirectTo: redirectTo,
  data: {
    full_name: safeName,
    age: safeAge,
  },
},
```

Replace with:
```typescript
options: {
  emailRedirectTo: redirectTo,
  data: {
    full_name: safeName,
  },
},
```

- [ ] **Step 3: Remove age from buildUserProfile call**

Find:
```typescript
const profile = buildUserProfile({
  fullName: safeName,
  age: safeAge,
  email: normalizedEmail,
});
```

Replace with:
```typescript
const profile = buildUserProfile({
  fullName: safeName,
  email: normalizedEmail,
});
```

- [ ] **Step 4: Remove the Age input from the JSX**

Find and delete the entire age label block:
```tsx
<label className="field">
  <span>Age</span>
  <input
    min={1}
    onChange={(event) => setAge(event.target.value)}
    placeholder="e.g. 28"
    required
    type="number"
    value={age}
  />
</label>
```

- [ ] **Step 5: Remove age from submit button disabled check**

Find:
```tsx
disabled={loading || !fullName.trim() || !age || !email.trim() || !password}
```

Replace with:
```tsx
disabled={loading || !fullName.trim() || !email.trim() || !password}
```

- [ ] **Step 6: Update create-account page copy**

In `src/app/auth/create-account/page.tsx`, find:
```tsx
<p className="auth-entry-visual__body">
  Share your name, age, email, and password. We&apos;ll take you into workspace setup right after signup.
</p>
```

Replace with:
```tsx
<p className="auth-entry-visual__body">
  Share your name, email, and password. We&apos;ll take you into workspace setup right after.
</p>
```

Also find the description body text on the right panel if there's mention of age and remove it.

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors. If `buildUserProfile` has a required `age` parameter, check `src/lib/services/profile.ts` and make `age` optional there too.

- [ ] **Step 8: Verify sign-up form**

With dev server running:
1. Go to `/auth/create-account`
2. Confirm: no age field in the form
3. Confirm: form submits with name + email + password only

- [ ] **Step 9: Commit**

```bash
git add src/components/auth/simple-sign-up-form.tsx src/app/auth/create-account/page.tsx
git commit -m "fix: remove age field from sign-up form"
```

---

## Task 5: Fix mobile — sidebar closed by default, input accessible

**Client issue:** "Particularly on mobile, the UI is too cluttered." (High)

The sidebar already closes on mobile (`window.innerWidth < 900`). This task ensures the hamburger/open button is always visible and the input bar has proper bottom spacing on mobile (safe area for iOS notch/home indicator).

**Files:**
- Modify: `src/app/w/[workspaceSlug]/chat/page.module.css`

- [ ] **Step 1: Check edge toggle button visibility**

In `chat/page.module.css`, find `.edgeToggle`. It should always be visible regardless of sidebar state. Confirm it's not hidden when sidebar is open on mobile. It should look something like:

```css
.edgeToggle {
  position: fixed;  /* or absolute */
  top: 14px;
  left: 14px;
  z-index: 50;
  ...
}
```

If it's hidden when sidebar is open (e.g. `display: none` inside `.chatSidebarOpen`), make it always visible by removing that rule.

- [ ] **Step 2: Add safe area padding to the composer**

In `chat/page.module.css`, find `.composer`. Add `padding-bottom` safe area for iOS:

```css
.composer {
  /* existing rules stay — add: */
  padding-bottom: max(12px, env(safe-area-inset-bottom));
}
```

- [ ] **Step 3: Check landing shell doesn't overflow on small screens**

Find `.landingShell` in the CSS. Ensure it uses `min-height: 0` and doesn't cause overflow:

```css
.landingShell {
  /* existing rules stay — ensure it has: */
  overflow-y: auto;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}
```

- [ ] **Step 4: Verify on 375px viewport**

In browser dev tools, set viewport to 375px width (iPhone SE).
1. Open chat page
2. Confirm sidebar is closed (hamburger visible top-left)
3. Confirm input bar is visible and not cut off at bottom
4. Tap a suggestion card — input fills, no scroll issues
5. Send a message — response appears in thread, thread scrolls to bottom

- [ ] **Step 5: Commit**

```bash
git add src/app/w/\[workspaceSlug\]/chat/page.module.css
git commit -m "fix: mobile safe area and edge toggle visibility"
```

---

## Task 6: Fix profile.ts if age is required there

**Context:** `buildUserProfile` in `src/lib/services/profile.ts` may have `age` as a required parameter. Task 4 removes it from the call site. This task ensures the function signature allows it.

**Files:**
- Modify: `src/lib/services/profile.ts` (only if needed)

- [ ] **Step 1: Check buildUserProfile signature**

Read `src/lib/services/profile.ts` and find `buildUserProfile`. If it has:

```typescript
function buildUserProfile({ fullName, age, email }: { fullName: string; age: number; email: string }) {
```

Make `age` optional:
```typescript
function buildUserProfile({ fullName, age, email }: { fullName: string; age?: number; email?: string }) {
```

And remove any logic that uses `age` in a way that would fail without it (e.g. remove it from stored profile or mark it optional in the returned object).

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
npm run test
```

Expected: all tests pass (there are 20 tests in the suite, none should touch the sign-up form age field).

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit if any changes were needed**

```bash
git add src/lib/services/profile.ts
git commit -m "fix: make age optional in buildUserProfile"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task that covers it |
|---|---|
| Suggestion cards fill input, don't auto-send | Task 1 |
| Remove typewriter animation, static greeting | Task 2 |
| Remove confusing Records panel | Task 3 |
| Remove age from sign-up | Task 4 + 6 |
| Mobile clutter / safe area | Task 5 |

### Not in this plan (out of scope for this sprint)

- Google/Facebook OAuth — requires Supabase OAuth provider setup (infrastructure change, not code-only)
- Fix email confirm localhost URL — the code already uses `window.location.origin` dynamically. The real fix is updating the Supabase project's Site URL in the Supabase dashboard to the production domain. Not a code change.
- Action cards open as slide-over (not navigation) — already implemented in the current code (`openSheet` function + `sheetOpen` state). Works correctly.
- Markdown rendering — already wired (`react-markdown` with `remarkGfm` at line 1017). Works correctly.
