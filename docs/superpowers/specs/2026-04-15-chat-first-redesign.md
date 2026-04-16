# Chertt Chat-First Redesign

**Date:** 2026-04-15  
**Status:** Approved  
**Source:** Client issue tracker (13 issues, all Critical/High)

---

## Problem

The app feels like a dashboard with a chat box bolted on. The client's exact words: "confusing asf." Root cause: backend complexity bleeds through to the surface. The product doesn't know it's a chat app yet.

---

## Goal

Make the chat page feel like ChatGPT or Claude — clean, minimal, mobile-first. Everything else is secondary.

---

## Changes

### 1. Empty state
- Remove typewriter animation
- Single static greeting: "What can I help with?"
- Input bar is the focus, nothing else competes

### 2. Suggestion cards
- Tap fills the input bar — does NOT auto-submit
- User can edit the pre-filled text before sending
- Fixes: "options open a chat instead of filling the text bar" (Critical)

### 3. Message thread
- All AI responses render inline in full — no truncation, no expand
- react-markdown already installed, wire it up properly
- Fixes: "responses don't show in full, requires second click" (Normal)

### 4. Sidebar
- Mobile: closed by default, hamburger top-left to open
- Desktop: open by default
- Cleaner visual — reduce borders, shadows, clutter

### 5. Action cards
- Tapping opens a slide-over sheet, not page navigation
- User stays in the chat thread

### 6. Auth
- Fix email confirm URL (localhost → real domain)
- Simplify sign-up: email + password only, no age field
- Add Google OAuth option

### 7. Mobile
- Input bar pinned to bottom, full width
- No overlapping elements
- Every tap target minimum 44px

---

## Files Touched

- `src/app/w/[workspaceSlug]/chat/page.tsx` — primary
- `src/app/w/[workspaceSlug]/chat/page.module.css` — layout
- `src/components/auth/simple-sign-up-form.tsx` — auth simplification
- `src/app/auth/sign-in/page.tsx` — sign-in page
- `src/app/globals.css` — global mobile fixes
