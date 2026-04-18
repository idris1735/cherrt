const GRAPH_API = "https://graph.facebook.com/v19.0";
const MAX_MESSAGE_LENGTH = 4096;

function getPhoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("WHATSAPP_PHONE_NUMBER_ID env var is not set");
  return id;
}

function getAccessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN env var is not set");
  return token;
}

export async function sendTextMessage(to: string, text: string): Promise<void> {
  const body = text.slice(0, MAX_MESSAGE_LENGTH);
  const res = await fetch(`${GRAPH_API}/${getPhoneNumberId()}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`WhatsApp send failed: ${res.status} — ${error}`);
  }
}

export async function downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const token = getAccessToken();

  const urlRes = await fetch(`${GRAPH_API}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!urlRes.ok) throw new Error(`Media URL fetch failed: ${urlRes.status}`);
  const { url, mime_type } = (await urlRes.json()) as { url: string; mime_type: string };

  const mediaRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!mediaRes.ok) throw new Error(`Media download failed: ${mediaRes.status}`);
  const buffer = Buffer.from(await mediaRes.arrayBuffer());

  return { buffer, mimeType: mime_type };
}
