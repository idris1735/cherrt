// Member-facing giving via Paystack: generates a secure payment link. Distinct
// from church-tools' record_giving (finance recording money already received) —
// this one COLLECTS money. The giving is recorded by the Paystack webhook when
// payment completes (app/api/paystack/webhook). Inactive until PAYSTACK_SECRET_KEY
// is set. See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { randomUUID } from "node:crypto";
import { initializeGivingPayment, paystackConfigured } from "@/lib/services/payments/paystack";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentContext, AgentTool } from "@/lib/services/agent/tools";

const GIVING_TYPES = ["tithe", "offering", "donation", "pledge"] as const;
function normalizeGivingType(raw: unknown): (typeof GIVING_TYPES)[number] {
  const t = String(raw ?? "").toLowerCase();
  return (GIVING_TYPES as readonly string[]).includes(t) ? (t as (typeof GIVING_TYPES)[number]) : "offering";
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://cherrt.vercel.app";
}

// Demo giving (no Paystack key): create a pending demo payment and return a link
// to a church-branded checkout page. Completing it records the giving. Lets the
// whole flow be experienced before real keys are wired.
async function startDemoGiving(ctx: AgentContext, amount: number, givingType: string): Promise<unknown> {
  const db = getSupabaseServerClient();
  if (!db) return { error: "storage unavailable" };
  const reference = `demo_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
  const { error } = await db.from("demo_payments").insert({
    id: randomUUID(),
    reference,
    workspace_id: ctx.workspaceId,
    amount,
    giving_type: givingType,
    donor_name: ctx.userName ?? "",
    donor_person_id: ctx.personId ?? null,
    donor_phone: ctx.phone ?? "",
    status: "pending",
  });
  if (error) return { error: error.message };
  return {
    ok: true,
    message:
      `🙏 To give ₦${amount.toLocaleString("en-NG")} (${givingType}), tap here:\n${appUrl()}/pay/${reference}\n\n` +
      "_(Demo mode — no real charge. Complete it and you'll see it recorded, just like the real thing.)_",
  };
}

export const PAYMENT_TOOLS: AgentTool[] = [
  {
    name: "give_now",
    description:
      "Help a member GIVE money now (tithe/offering/etc.) by generating a secure payment link they pay via card or bank transfer. Their giving is recorded automatically once payment completes.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Amount in Naira" },
        givingType: { type: "string", description: "tithe, offering, donation, or pledge" },
      },
      required: ["amount"],
    },
    mutates: true, // a member giving their own money — no minRank
    handler: async (args, ctx) => {
      const amount = Number(args.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { error: "How much would you like to give?" };
      const givingType = normalizeGivingType(args.givingType);
      // No real key yet → demo flow so the experience can be seen end-to-end.
      if (!paystackConfigured()) return startDemoGiving(ctx, amount, givingType);
      // Paystack requires an email; derive a stable placeholder from the phone.
      const email = `${(ctx.phone ?? "giver").replace(/\D/g, "") || "giver"}@giving.chertt.app`;
      const result = await initializeGivingPayment({
        amountNaira: amount,
        email,
        metadata: {
          workspace_id: ctx.workspaceId,
          giving_type: givingType,
          donor_name: ctx.userName ?? "",
          donor_phone: ctx.phone ?? "",
          donor_person_id: ctx.personId ?? "",
        },
      });
      if (!result) return { error: "Couldn't start the payment just now — please try again in a moment." };
      return {
        ok: true,
        message: `🙏 To give ₦${amount.toLocaleString("en-NG")} (${givingType}), pay securely here:\n${result.authorizationUrl}\n\nYour giving will be recorded automatically once payment completes. God bless you!`,
      };
    },
  },
];
