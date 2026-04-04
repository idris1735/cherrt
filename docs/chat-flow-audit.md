# Chat Flow Audit (2026-04-04)

## Reported issues
- Chats disappear after refresh/tab close.
- Sidebar keeps showing only the two default chats.
- New chats do not auto-title from first user message.
- "Open full view" can fail after reload because drafted docs are missing.

## Root cause
- Write paths for conversations/messages/documents depended on a `workspaces` **upsert** call.
- Under current RLS, workspace upsert can fail for normal members, so downstream writes silently fail.
- Result: UI updates locally, but DB persistence fails, so refresh returns baseline/default threads.

## Fixes applied
- Replaced workspace upsert-on-write with workspace resolution by:
  - workspace `id` (if UUID), else
  - workspace `slug`.
- Updated all write paths to use resolved workspace row:
  - conversation create/update
  - message insert
  - AI artifact persistence
  - smart document draft save
  - request approval update
- Added auto-title behavior:
  - conversations titled `New chat...` or `Team chat...` are renamed from first user message.
- Added conversation title sync to Supabase when title changes.
- Sorted loaded conversations newest-first (`created_at desc`) for better sidebar behavior.

## Database migration added
- `supabase/migrations/20260406_conversation_update_policy.sql`
- Adds RLS policy allowing workspace members to update conversations, required for persisted auto-title.

## Verification checks to run
1. Create new chat, send one message, refresh page:
   - chat still exists
   - message still exists
   - title is auto-generated from message.
2. Draft a document in chat, click `Open full view`, refresh, reopen link:
   - document detail page loads successfully.
3. Create multiple chats:
   - newest appears at top of sidebar.

## Status
- Build: passing
- Tests: passing
