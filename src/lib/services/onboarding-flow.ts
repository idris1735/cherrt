// Deterministic, guided new-church signup flow — separate from the
// free-form Gemini artifact path in ai-service.ts. Collecting church name ->
// admin name -> role -> city -> size in order needs precise structure, not
// an LLM improvising the sequence. See design doc:
// docs/superpowers/specs/2026-07-18-whatsapp-native-onboarding-design.md

import { updateSession, type WhatsAppSession } from "@/lib/services/whatsapp-session";
import { createPendingOrganization, platformAdminPhones, type PendingOrganization } from "@/lib/services/whatsapp-workspace";
import { sendTextMessage } from "@/lib/services/whatsapp";

type OnboardingStep = "name" | "admin_name" | "admin_role" | "city" | "size" | "confirm";
type Collected = NonNullable<NonNullable<WhatsAppSession["onboarding"]>["collected"]>;

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

export async function cancelSignupFlow(phoneNumber: string): Promise<void> {
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
