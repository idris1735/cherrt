// Deterministic, guided new-church signup flow — separate from the
// free-form Gemini artifact path in ai-service.ts. Collecting church name ->
// admin name -> role -> city -> size in order needs precise structure, not
// an LLM improvising the sequence. See design doc:
// docs/superpowers/specs/2026-07-18-whatsapp-native-onboarding-design.md

import { updateSession, type WhatsAppSession } from "@/lib/services/whatsapp-session";
import {
  createPendingOrganization,
  platformAdminPhones,
  createBranch,
  saveGivingCategories,
  saveMinistryUnits,
  codeFromWorkspaceId,
  normalizePhoneNumber,
  type PendingOrganization,
} from "@/lib/services/whatsapp-workspace";
import { sendTextMessage } from "@/lib/services/whatsapp";

type SignupState = Extract<NonNullable<WhatsAppSession["onboarding"]>, { flow: "new-church-signup" }>;
type OnboardingStep = SignupState["step"];
type Collected = SignupState["collected"];

const STEP_ORDER: OnboardingStep[] = ["name", "admin_name", "admin_role", "city", "size", "confirm"];

export const SIGNUP_TRIGGER_RE =
  /\b(set ?up|start|register|sign ?up|create)\b.{0,20}\b(my church|our church|a church|new church|church account)\b/i;

export function isSignupTrigger(text: string): boolean {
  return SIGNUP_TRIGGER_RE.test(text.trim());
}

function promptFor(step: OnboardingStep, collected: Collected): string {
  switch (step) {
    case "name":
      return "Let's get your church set up on Chertt. First — what's your church's name?";
    case "admin_name":
      return "Got it. What's your full name?";
    case "admin_role":
      return "And your role — Senior Pastor, Administrator, or something else?";
    case "city":
      return "Which city are you based in?";
    case "size":
      return 'Roughly how many people attend? A number or a range is fine — e.g. "300" or "200-300".';
    case "confirm":
      return [
        "Let's confirm before I send this to our team:",
        "",
        `*Church:* ${collected.name}`,
        `*Admin:* ${collected.adminName} (${collected.adminRole})`,
        `*City:* ${collected.city}`,
        `*Size:* ${collected.size}`,
        "",
        "Reply *YES* to submit, or *NO* to start over.",
      ].join("\n");
  }
}

export async function startSignupFlow(phoneNumber: string): Promise<string> {
  await updateSession(phoneNumber, {
    onboarding: { flow: "new-church-signup", step: "name", collected: {} },
  });
  return promptFor("name", {});
}

export async function cancelOnboardingFlow(phoneNumber: string): Promise<void> {
  await updateSession(phoneNumber, { onboarding: undefined });
}

async function notifyPlatformAdmins(pending: PendingOrganization): Promise<void> {
  const admins = platformAdminPhones();
  if (!admins.length) {
    console.error("PLATFORM_ADMIN_PHONES is not set — new church signup has nowhere to be approved from.");
    return;
  }

  const message = [
    "*New church pending*",
    "",
    `Church: ${pending.name}`,
    `Contact: ${pending.requestedByName} (${pending.requestedByPhone})`,
    `City: ${pending.requestedCity}`,
    `Size: ~${pending.requestedSize}`,
    "",
    `Reply *APPROVE ${pending.code}* or *REJECT ${pending.code}*`,
  ].join("\n");

  await Promise.allSettled(admins.map((phone) => sendTextMessage(phone, message)));
}

// Returns the reply to send back, or null if there's no in-progress
// signup flow for this session (caller should fall through to normal
// message handling).
export async function advanceSignupFlow(
  phoneNumber: string,
  session: WhatsAppSession,
  replyText: string,
): Promise<string | null> {
  const state = session.onboarding;
  if (!state || state.flow !== "new-church-signup") return null;

  const trimmed = replyText.trim();
  if (!trimmed) return promptFor(state.step, state.collected);

  if (state.step === "confirm") {
    if (/^(yes|y|confirm)$/i.test(trimmed)) {
      const pending = await createPendingOrganization({
        name: state.collected.name ?? "",
        requestedByPhone: phoneNumber,
        requestedByName: state.collected.adminName ?? "",
        requestedCity: state.collected.city ?? "",
        requestedSize: state.collected.size ?? "",
      });

      await updateSession(phoneNumber, { onboarding: undefined });

      if (!pending) {
        return "Something went wrong submitting that — please try again in a moment.";
      }

      await notifyPlatformAdmins(pending);

      return "Thanks! Your request is with our team — we'll confirm within a day or two. We'll message you here the moment it's approved.";
    }

    if (/^(no|n|restart|start over)$/i.test(trimmed)) {
      await updateSession(phoneNumber, {
        onboarding: { flow: "new-church-signup", step: "name", collected: {} },
      });
      return promptFor("name", {});
    }

    return 'Reply *YES* to submit, or *NO* to start over.\n\n' + promptFor("confirm", state.collected);
  }

  const collected: Collected = { ...state.collected };
  switch (state.step) {
    case "name":
      collected.name = trimmed;
      break;
    case "admin_name":
      collected.adminName = trimmed;
      break;
    case "admin_role":
      collected.adminRole = trimmed;
      break;
    case "city":
      collected.city = trimmed;
      break;
    case "size":
      collected.size = trimmed;
      break;
  }

  const currentIndex = STEP_ORDER.indexOf(state.step);
  const next = STEP_ORDER[currentIndex + 1] ?? "confirm";

  await updateSession(phoneNumber, {
    onboarding: { flow: "new-church-signup", step: next, collected },
  });

  return promptFor(next, collected);
}

// ─── Post-approval setup ────────────────────────────────────────────────
//
// Runs immediately after an organization is approved (started by the
// caller right when approveOrganization succeeds). Giving categories ->
// ministry units -> optional branches (looped, each provisioned by the org
// admin's own authority, no re-approval) -> done, with a real join code for
// the first workspace.

type SetupState = Extract<NonNullable<WhatsAppSession["onboarding"]>, { flow: "post-approval-setup" }>;
type SetupStep = SetupState["step"];
type SetupCollected = SetupState["collected"];

// Returns true/false for a clear yes/no, or null for anything else --
// callers re-prompt on null rather than silently defaulting to "no", same
// discipline the signup flow's confirm step already applies.
function parseYesNo(text: string): boolean | null {
  if (/^(yes|y|yeah|yep)$/i.test(text)) return true;
  if (/^(no|n|nope|nah)$/i.test(text)) return false;
  return null;
}

function setupPromptFor(step: SetupStep): string {
  switch (step) {
    case "giving_categories":
      return 'Let\'s finish setting up. What giving categories do you want to track? List them separated by commas — e.g. "Tithes, Offerings, Building Fund".';
    case "ministry_units":
      return 'Got it. What are your ministry units? Same format — e.g. "Children\'s Ministry, Ushering, Worship, Media".';
    case "ask_branch":
      return "Do you have other branch locations? Reply YES or NO.";
    case "branch_name":
      return "What's the branch called?";
    case "branch_city":
      return "Which city is that branch in?";
    case "branch_admin_phone":
      return "What's the phone number for that branch's admin/pastor? Include the country code, e.g. 234...";
    case "branch_more":
      return "Another branch? Reply YES or NO.";
    case "done":
      return "";
  }
}

export async function startSetupFlow(phoneNumber: string, organizationId: string, workspaceId: string): Promise<string> {
  await updateSession(phoneNumber, {
    onboarding: {
      flow: "post-approval-setup",
      step: "giving_categories",
      collected: { organizationId, workspaceId, branches: [] },
    },
  });
  return setupPromptFor("giving_categories");
}

async function finishSetup(phoneNumber: string, collected: SetupCollected): Promise<string> {
  await updateSession(phoneNumber, { onboarding: undefined });

  const joinCode = codeFromWorkspaceId(collected.workspaceId);
  const lines = [
    "You're all set! 🎉",
    "",
    collected.givingCategories?.length ? `Giving categories: ${collected.givingCategories.join(", ")}` : null,
    collected.ministryUnits?.length ? `Ministry units: ${collected.ministryUnits.join(", ")}` : null,
    collected.branches.length ? `Branches added: ${collected.branches.length} (each one gets its own code once you check the dashboard, or ask me "invite code for [branch name]")` : null,
    "",
    "Share this with your congregation so they can join:",
    `"JOIN ${joinCode}" to this number`,
  ].filter(Boolean);

  return lines.join("\n");
}

export async function advanceSetupFlow(
  phoneNumber: string,
  session: WhatsAppSession,
  replyText: string,
): Promise<string | null> {
  const state = session.onboarding;
  if (!state || state.flow !== "post-approval-setup") return null;

  const trimmed = replyText.trim();
  if (!trimmed) return setupPromptFor(state.step);

  const collected: SetupCollected = { ...state.collected };

  switch (state.step) {
    case "giving_categories": {
      collected.givingCategories = await saveGivingCategories(collected.workspaceId, trimmed);
      await updateSession(phoneNumber, { onboarding: { flow: "post-approval-setup", step: "ministry_units", collected } });
      return setupPromptFor("ministry_units");
    }

    case "ministry_units": {
      collected.ministryUnits = await saveMinistryUnits(collected.workspaceId, trimmed);
      await updateSession(phoneNumber, { onboarding: { flow: "post-approval-setup", step: "ask_branch", collected } });
      return setupPromptFor("ask_branch");
    }

    case "ask_branch": {
      const answer = parseYesNo(trimmed);
      if (answer === null) {
        return `Sorry, just reply YES or NO.\n\n${setupPromptFor("ask_branch")}`;
      }
      if (answer) {
        await updateSession(phoneNumber, { onboarding: { flow: "post-approval-setup", step: "branch_name", collected } });
        return setupPromptFor("branch_name");
      }
      return finishSetup(phoneNumber, collected);
    }

    case "branch_name": {
      collected.branchDraft = { name: trimmed };
      await updateSession(phoneNumber, { onboarding: { flow: "post-approval-setup", step: "branch_city", collected } });
      return setupPromptFor("branch_city");
    }

    case "branch_city": {
      collected.branchDraft = { ...collected.branchDraft, city: trimmed };
      await updateSession(phoneNumber, { onboarding: { flow: "post-approval-setup", step: "branch_admin_phone", collected } });
      return setupPromptFor("branch_admin_phone");
    }

    case "branch_admin_phone": {
      const normalizedPhone = normalizePhoneNumber(trimmed);
      if (!normalizedPhone) {
        return `That doesn't look like a valid phone number — please include the country code, e.g. 2347069181608.\n\n${setupPromptFor("branch_admin_phone")}`;
      }

      const draft = collected.branchDraft ?? {};
      const branchResult = await createBranch({
        organizationId: collected.organizationId,
        name: draft.name ?? "Branch",
        city: draft.city ?? "",
        adminPhone: normalizedPhone,
        adminName: "",
      });
      collected.branches = [...collected.branches, { name: draft.name ?? "Branch", city: draft.city ?? "", adminPhone: normalizedPhone }];
      collected.branchDraft = undefined;
      await updateSession(phoneNumber, { onboarding: { flow: "post-approval-setup", step: "branch_more", collected } });

      // Note: this is a cold, business-initiated message to someone who has
      // never contacted Chertt -- flagged as a real policy risk (see
      // 2026-07-18 onboarding audit), not just a template gap. Left as
      // free-form pending that decision; wrapped so a delivery failure here
      // never breaks the rest of the setup flow for the org admin.
      if (branchResult) {
        try {
          await sendTextMessage(
            normalizedPhone,
            `You've been added as the admin for *${branchResult.workspaceName}* on Chertt. Say "Hi" here anytime to get started, or reply "JOIN ${codeFromWorkspaceId(branchResult.workspaceId)}" from any other number to test how members join.`,
          );
        } catch (err) {
          console.error("Failed to notify branch admin:", err instanceof Error ? err.message : err);
        }
      }

      const confirmLine = branchResult ? `${branchResult.workspaceName} added — its admin has been notified.` : "Branch added.";
      return `${confirmLine}\n\n${setupPromptFor("branch_more")}`;
    }

    case "branch_more": {
      const answer = parseYesNo(trimmed);
      if (answer === null) {
        return `Sorry, just reply YES or NO.\n\n${setupPromptFor("branch_more")}`;
      }
      if (answer) {
        await updateSession(phoneNumber, { onboarding: { flow: "post-approval-setup", step: "branch_name", collected } });
        return setupPromptFor("branch_name");
      }
      return finishSetup(phoneNumber, collected);
    }

    case "done":
      return null;
  }
}
