// Member-facing giving via Paystack: generates a secure payment link. Distinct
// from church-tools' record_giving (finance recording money already received) —
// this one COLLECTS money. The giving is recorded by the Paystack webhook when
// payment completes (app/api/paystack/webhook). Inactive until PAYSTACK_SECRET_KEY
// is set. See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { initializeGivingPayment, paystackConfigured } from "@/lib/services/payments/paystack";
import type { AgentTool } from "@/lib/services/agent/tools";

const GIVING_TYPES = ["tithe", "offering", "donation", "pledge"] as const;
function normalizeGivingType(raw: unknown): (typeof GIVING_TYPES)[number] {
  const t = String(raw ?? "").toLowerCase();
  return (GIVING_TYPES as readonly string[]).includes(t) ? (t as (typeof GIVING_TYPES)[number]) : "offering";
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
      if (!paystackConfigured()) {
        return { error: "Online giving isn't set up for this church yet — please give in person or ask an admin." };
      }
      const givingType = normalizeGivingType(args.givingType);
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
