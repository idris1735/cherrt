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
  const res = await fetch(`${GRAPH_API}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${err}`);
  }
}

export async function sendTextMessage(to: string, text: string): Promise<void> {
  await postToGraph({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text.slice(0, MAX_TEXT_LENGTH), preview_url: false },
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
