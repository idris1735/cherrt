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
import { reportIssueFlow } from "@/lib/services/flows/report-issue";
import { eventRegisterFlow } from "@/lib/services/flows/event-register";
import { recordGivingFlow } from "@/lib/services/flows/record-giving";
import { announceFlow } from "@/lib/services/flows/announce";
import { addMemberFlow } from "@/lib/services/flows/add-member";
import { qrFlow } from "@/lib/services/flows/qr";
import { recordServiceFlow } from "@/lib/services/flows/record-service";
import { setBirthdayFlow } from "@/lib/services/flows/set-birthday";
import { volunteerSignupFlow } from "@/lib/services/flows/volunteer-signup";
import { lostFoundFlow } from "@/lib/services/flows/lost-found";
import { createEventFlow } from "@/lib/services/flows/create-event";
import { requestVolunteersFlow } from "@/lib/services/flows/request-volunteers";
import { officeGuestFlow } from "@/lib/services/flows/office-guest";
import { createClassroomFlow } from "@/lib/services/flows/create-classroom";
import { acceptArrivalsFlow } from "@/lib/services/flows/accept-arrivals";
import { holdSeatFlow } from "@/lib/services/flows/hold-seat";
import { arriveFlow } from "@/lib/services/flows/arrive";
import { pickupFlow } from "@/lib/services/flows/pickup";
import { convertFirstTimerFlow } from "@/lib/services/flows/convert-first-timer";
import { joinFlow } from "@/lib/services/flows/join";

[childCheckinFlow, childRegisterFlow, guestConnectFlow, giveFlow, prayerFlow, pastoralFlow, pastoralFormFlow, firstTimerFlow, lifeJourneyFlow, reportIssueFlow, eventRegisterFlow, recordGivingFlow, announceFlow, addMemberFlow, qrFlow, recordServiceFlow, setBirthdayFlow, volunteerSignupFlow, lostFoundFlow, createEventFlow, requestVolunteersFlow, officeGuestFlow, createClassroomFlow, acceptArrivalsFlow, holdSeatFlow, arriveFlow, pickupFlow, convertFirstTimerFlow, joinFlow].forEach(registerFlow);
