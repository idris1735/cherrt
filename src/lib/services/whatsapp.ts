const GRAPH_API = "https://graph.facebook.com/v19.0";
const MAX_TEXT_LENGTH = 4096;

function phoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("WHATSAPP_PHONE_NUMBER_ID env var is not set");
  return id;
}

function accessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN env var is not set");
  return token;
}

function authHeaders() {
  return { Authorization: `Bearer ${accessToken()}`, "Content-Type": "application/json" };
}

async function postToGraph(payload: unknown): Promise<void> {
  // Slice B (consent layer): never message an opted-out number. Fail-open —
  // if the opt-out lookup can't run, send anyway (availability beats silence
  // for operational messages; opted-out suppression is best-effort).
  const to = (payload as { to?: string })?.to;
  if (to) {
    try {
      const { isOptedOut } = await import("@/lib/services/privacy/consent");
      if (await isOptedOut(to)) {
        void logSendFailure(payload, "suppressed: recipient opted out");
        return;
      }
    } catch {
      // lookup unavailable — proceed
    }
  }

  const res = await fetch(`${GRAPH_API}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    logSendFailure(payload, `WhatsApp API ${res.status}: ${err}`);
    throw new Error(`WhatsApp API ${res.status}: ${err}`);
  }
}

// P2-15: best-effort failure log — failures must never be silent. The log row
// lets the owner spot a broken number/template mid-demo. Never throws.
function logSendFailure(payload: unknown, error: string): void {
  void (async () => {
    try {
      const { getSupabaseServerClient } = await import("@/lib/services/supabase-server");
      const db = getSupabaseServerClient();
      if (!db) return;
      const p = payload as { to?: string; type?: string };
      await db.from("whatsapp_send_logs").insert({
        kind: p.type ?? "unknown",
        to_phone: p.to ?? null,
        status: "failed",
        error: error.slice(0, 500),
        payload: payload as Record<string, unknown>,
      });
    } catch {
      // logging must never cascade
    }
  })();
}

export async function sendTextMessage(to: string, text: string): Promise<void> {
  await postToGraph({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text.slice(0, MAX_TEXT_LENGTH), preview_url: false },
  });
}

// Sends an image message by public URL (Meta fetches the link), with an
// optional caption. Used to deliver a scannable QR — e.g. a child's pickup pass
// — straight into the chat, no web page needed.
export async function sendImageMessage(to: string, imageUrl: string, caption?: string): Promise<void> {
  await postToGraph({
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { link: imageUrl, ...(caption ? { caption: caption.slice(0, 1024) } : {}) },
  });
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  params: string[],
): Promise<void> {
  await postToGraph({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: params.length
        ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
        : [],
    },
  });
}

export type InteractiveButton = {
  id: string;    // up to 256 chars — encode all action state here
  title: string; // up to 20 chars shown on button face
};

// Sends a message with up to 3 tappable reply buttons.
// Use instead of asking users to type CONFIRM/CANCEL/APPROVE/REJECT.
export async function sendInteractiveButtons(
  to: string,
  bodyText: string,
  buttons: InteractiveButton[],
  header?: string,
  footer?: string,
): Promise<void> {
  const interactive: Record<string, unknown> = {
    type: "button",
    body: { text: bodyText.slice(0, 1024) },
    action: {
      buttons: buttons.slice(0, 3).map((b) => ({
        type: "reply",
        reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
      })),
    },
  };
  if (header) interactive.header = { type: "text", text: header.slice(0, 60) };
  if (footer) interactive.footer = { text: footer.slice(0, 60) };

  await postToGraph({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive,
  });
}

export type InteractiveListRow = {
  id: string;
  title: string;
  description?: string;
};

// Sends a list-picker message for 4-10 options (too many for buttons).
export async function sendInteractiveList(
  to: string,
  bodyText: string,
  buttonLabel: string,
  rows: InteractiveListRow[],
  header?: string,
  footer?: string,
): Promise<void> {
  const interactive: Record<string, unknown> = {
    type: "list",
    body: { text: bodyText.slice(0, 1024) },
    action: {
      button: buttonLabel.slice(0, 20),
      sections: [{
        title: "Options",
        rows: rows.slice(0, 10).map((r) => ({
          id: r.id.slice(0, 200),
          title: r.title.slice(0, 24),
          ...(r.description ? { description: r.description.slice(0, 72) } : {}),
        })),
      }],
    },
  };
  if (header) interactive.header = { type: "text", text: header.slice(0, 60) };
  if (footer) interactive.footer = { text: footer.slice(0, 60) };

  await postToGraph({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive,
  });
}

export async function downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const token = accessToken();

  const urlRes = await fetch(`${GRAPH_API}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!urlRes.ok) throw new Error(`Media URL fetch failed: ${urlRes.status}`);

  const { url, mime_type } = (await urlRes.json()) as { url: string; mime_type: string };
  if (!url) throw new Error("Media URL missing in Graph API response");

  const mediaRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!mediaRes.ok) throw new Error(`Media download failed: ${mediaRes.status}`);

  return { buffer: Buffer.from(await mediaRes.arrayBuffer()), mimeType: mime_type };
}
