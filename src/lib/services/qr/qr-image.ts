// Server-only QR image generation. Produces a self-contained PNG data URL (no
// external calls, printable at size) rendered in Chertt's church-green. Kept
// apart from qr.ts so the pure link/preset logic stays dependency-free.
import QRCode from "qrcode";

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 1000,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0b3d2e", light: "#ffffff" },
  });
}

// Raw PNG bytes for the QR — served by the /qr/img route so WhatsApp (or any
// client) can fetch it as an image.
export async function qrPngBuffer(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    width: 800,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0b3d2e", light: "#ffffff" },
  });
}
