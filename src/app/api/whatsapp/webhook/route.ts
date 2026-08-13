import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/services/whatsapp-processor";
import { recordDeliveryStatus } from "@/lib/services/whatsapp-status";

export function GET(request: NextRequest): NextResponse {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// Meta allows up to 20s; await the handler so Vercel doesn't kill it before completion.
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: MetaPayload | null = null;
  try {
    body = (await request.json()) as MetaPayload;
  } catch {
    // Malformed JSON — return 200 so Meta doesn't retry
  }

  if (body) {
    try {
      await handlePayload(body);
    } catch {
      // Swallow errors — always return 200 to Meta
    }
  }

  return new NextResponse("OK", { status: 200 });
}

type MetaPayload = {
  object: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<MetaMessage>;
        statuses?: Array<MetaStatus>;
      };
    }>;
  }>;
};

type MetaStatus = {
  id: string;
  status: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code: number; title: string; message: string }>;
};

type MetaMessage = {
  from: string;
  type: string;
  id: string;
  text?: { body: string };
  image?: { id: string };
  document?: { id: string };
  audio?: { id: string };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
};

async function handlePayload(payload: MetaPayload): Promise<void> {
  if (payload.object !== "whatsapp_business_account") return;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      // WS5 — outbound delivery statuses (sent/delivered/read/failed). Failures
      // and undelivered messages are logged so nothing vanishes silently.
      for (const st of change.value?.statuses ?? []) {
        const error = st.errors?.[0] ? `${st.errors[0].title ?? "error"}: ${st.errors[0].message ?? ""}` : undefined;
        await recordDeliveryStatus({
          messageId: st.id,
          to: st.recipient_id ?? "",
          status: st.status,
          error,
        });
      }
      for (const msg of change.value?.messages ?? []) {
        const type = normalizeType(msg.type);
        await processWhatsAppMessage({
          messageId: msg.id,
          from: msg.from,
          type,
          text: msg.text?.body ?? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title,
          mediaId: msg.image?.id ?? msg.document?.id ?? msg.audio?.id,
          buttonReplyId: msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id,
        });
      }
    }
  }
}

function normalizeType(
  type: string,
): "text" | "image" | "document" | "audio" | "interactive" | "unknown" {
  switch (type) {
    case "text":        return "text";
    case "image":       return "image";
    case "document":    return "document";
    case "audio":       return "audio";
    case "interactive": return "interactive";
    default:            return "unknown";
  }
}
