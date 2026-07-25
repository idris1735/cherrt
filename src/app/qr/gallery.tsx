import { PRESET_LIST } from "@/lib/services/qr/qr";

// The index an admin lands on at /qr with no params: a card per preset, each
// opening its printable poster. New props added to PRESET_LIST show up here for
// free.
export function Gallery() {
  return (
    <div style={wrap}>
      <div style={{ width: "100%", maxWidth: 880 }}>
        <div style={eyebrow}>CHERTT · QR POSTERS</div>
        <h1 style={h1}>Scan-to-WhatsApp posters</h1>
        <p style={sub}>Each poster is a QR that opens WhatsApp with a message ready to send — no app, no login. Open one, then print it or show it on a screen.</p>
        <div style={grid}>
          {PRESET_LIST.map((p) => (
            <a key={p.id} href={`/qr?preset=${p.id}`} style={cardLink}>
              <div style={cardTitle}>{p.title}</div>
              <div style={cardBlurb}>{p.blurb}</div>
              <div style={cardCta}>Open poster →</div>
            </a>
          ))}
        </div>
        <p style={note}>Tip: add <code style={code}>?text=Your%20message</code> to any poster URL for a custom message, or <code style={code}>?code=482913</code> to the pickup tag.</p>
      </div>
    </div>
  );
}

const wrap = { minHeight: "100vh", margin: 0, background: "#eef1ee", color: "#12261d", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 24px" } as const;
const eyebrow = { fontSize: 12, letterSpacing: "0.18em", fontWeight: 700, color: "#2e7d5b" } as const;
const h1 = { margin: "10px 0 8px", fontSize: 32, fontWeight: 800 } as const;
const sub = { margin: "0 0 26px", fontSize: 16, color: "#5b6b62", maxWidth: 560 } as const;
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 } as const;
const cardLink = { display: "block", background: "#fff", border: "1px solid #dde3de", borderRadius: 16, padding: "20px", textDecoration: "none", color: "inherit", boxShadow: "0 8px 24px rgba(11,61,46,.06)" } as const;
const cardTitle = { fontSize: 17, fontWeight: 700, color: "#12261d" } as const;
const cardBlurb = { fontSize: 14, color: "#5b6b62", margin: "6px 0 14px", lineHeight: 1.4 } as const;
const cardCta = { fontSize: 14, fontWeight: 700, color: "#0b3d2e" } as const;
const note = { fontSize: 13, color: "#7a877f", marginTop: 24 } as const;
const code = { background: "#e3e9e4", borderRadius: 6, padding: "2px 6px", fontSize: 12 } as const;
