-- Store the requester's WhatsApp phone on the workflow request itself, so the
-- approver's decision notifies the RIGHT requester. Previously the requester
-- phone lived only on the approver's session (pending_approval), which the next
-- incoming request overwrote — with two requests pending, approving one pinged
-- the wrong person. Keying the phone off the request id (carried by the
-- Approve/Reject buttons) fixes that regardless of how many are pending.
alter table workflow_requests add column if not exists requester_phone text;
