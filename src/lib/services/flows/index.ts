// Registers every deterministic task flow with the engine.
// Import once (for side effects) — whatsapp-processor.ts does this at the top.
import { registerFlow } from "@/lib/services/flows/engine";
import { childCheckinFlow } from "@/lib/services/flows/child-checkin";

registerFlow(childCheckinFlow);
