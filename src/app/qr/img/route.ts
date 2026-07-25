import { resolvePoster, buildWaLink, type PosterParams } from "@/lib/services/qr/qr";
import { qrPngBuffer } from "@/lib/services/qr/qr-image";

export const dynamic = "force-dynamic";

// GET /qr/img?preset=pickup&code=482913  → the QR as a raw PNG.
// This is what lets WhatsApp send a QR inline (Meta fetches an image URL), and
// works for any preset or ?text= just like the poster page.
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const params: PosterParams = {
    preset: url.searchParams.get("preset") ?? undefined,
    text: url.searchParams.get("text") ?? undefined,
    title: url.searchParams.get("title") ?? undefined,
    code: url.searchParams.get("code") ?? undefined,
  };
  const poster = resolvePoster(params);
  const link = buildWaLink(poster.waText);
  const png = await qrPngBuffer(link);
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
