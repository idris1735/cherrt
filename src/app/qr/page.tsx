import { resolvePoster, buildWaLink, type PosterParams } from "@/lib/services/qr/qr";
import { qrDataUrl } from "@/lib/services/qr/qr-image";
import { Poster } from "./poster";
import { Gallery } from "./gallery";

export const dynamic = "force-dynamic";

// /qr           → gallery of every poster
// /qr?preset=x  → a printable poster whose QR opens WhatsApp pre-filled
// /qr?text=...  → a custom-message poster
export default async function QrPage({ searchParams }: { searchParams: Promise<PosterParams> }) {
  const params = await searchParams;

  // No preset and no custom text → show the gallery index.
  if (!params.preset && !(params.text ?? "").trim()) {
    return <Gallery />;
  }

  const poster = resolvePoster(params);
  const waLink = buildWaLink(poster.waText);
  // Never let a QR-generation hiccup break the page — the poster falls back to
  // the raw tappable link when dataUrl is empty.
  let dataUrl = "";
  try {
    dataUrl = await qrDataUrl(waLink);
  } catch {
    dataUrl = "";
  }

  return <Poster dataUrl={dataUrl} title={poster.title} subtitle={poster.subtitle} waLink={waLink} />;
}
