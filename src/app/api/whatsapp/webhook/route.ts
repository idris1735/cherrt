import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/services/whatsapp-processor";

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
      };
    }>;
  }>;
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
