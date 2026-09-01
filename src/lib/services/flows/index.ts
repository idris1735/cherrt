// Registers every deterministic task flow with the engine.
// Import once (for side effects) — whatsapp-processor.ts does this at the top.
import { registerFlow } from "@/lib/services/flows/engine";
import { childCheckinFlow } from "@/lib/services/flows/child-checkin";
import { childRegisterFlow } from "@/lib/services/flows/child-register";
import { guestConnectFlow } from "@/lib/services/flows/guest-connect";
import { giveFlow } from "@/lib/services/flows/give";
import { prayerFlow } from "@/lib/services/flows/prayer";
import { pastoralFlow } from "@/lib/services/flows/pastoral";
import { pastoralFormFlow } from "@/lib/services/flows/pastoral-form";
import { firstTimerFlow } from "@/lib/services/flows/first-timer";
import { lifeJourneyFlow } from "@/lib/services/flows/life-journey";
import { joinFlow } from "@/lib/services/flows/join";

[childCheckinFlow, childRegisterFlow, guestConnectFlow, giveFlow, prayerFlow, pastoralFlow, pastoralFormFlow, firstTimerFlow, lifeJourneyFlow, joinFlow].forEach(registerFlow);
