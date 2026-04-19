import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/services/whatsapp-processor";

// Meta verification handshake — called once when you register the webhook in Meta dashboard
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

// Incoming message handler — Meta sends every WhatsApp event here
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: MetaWebhookPayload | null = null;

  try {
    body = (await request.json()) as MetaWebhookPayload;
  } catch {
    // Malformed JSON — still return 200 so Meta doesn't retry
  }

  // Always return 200 immediately — Meta retries if it doesn't get 200 within 20s
  if (body) {
    void handlePayload(body);
  }

  return new NextResponse("OK", { status: 200 });
}

type MetaWebhookPayload = {
  object: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string;
          type: string;
          text?: { body: string };
          image?: { id: string };
          document?: { id: string };
          audio?: { id: string };
          id: string;
        }>;
      };
    }>;
  }>;
};

async function handlePayload(payload: MetaWebhookPayload): Promise<void> {
  if (payload.object !== "whatsapp_business_account") return;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        const type = normalizeMessageType(message.type);
        await processWhatsAppMessage({
          from: message.from,
          type,
          text: message.text?.body,
          mediaId: message.image?.id ?? message.document?.id ?? message.audio?.id,
        });
      }
    }
  }
}

function normalizeMessageType(
  type: string,
): "text" | "image" | "document" | "audio" | "unknown" {
  switch (type) {
    case "text": return "text";
    case "image": return "image";
    case "document": return "document";
    case "audio": return "audio";
    default: return "unknown";
  }
}
