import { PrintButton } from "./print-button";

// Print-first poster: a big QR that launches WhatsApp pre-filled, with a warm
// headline and a three-step "how to scan" strip. Single (light) theme on
// purpose — these get printed on white paper.

const steps = [
  { n: "1", t: "Point your phone camera at the code" },
  { n: "2", t: "Tap the link that pops up" },
  { n: "3", t: "Hit send — Chertt takes it from there" },
];

export function Poster({
  dataUrl,
  title,
  subtitle,
  waLink,
}: {
  dataUrl: string;
  title: string;
  subtitle: string;
  waLink: string;
}) {
  return (
    <div style={wrap}>
      <style>{printCss}</style>
      <div style={card}>
        <div style={eyebrow}>CHERTT · ON WHATSAPP</div>
        <h1 style={h1}>{title}</h1>
        <p style={sub}>{subtitle}</p>

        <div style={qrBox}>
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt="Scan to open WhatsApp" width={320} height={320} style={{ width: "min(320px, 78vw)", height: "auto", display: "block" }} />
          ) : (
            <a href={waLink} style={{ color: "#0b3d2e", fontWeight: 700, wordBreak: "break-all" }}>{waLink}</a>
          )}
        </div>

        <ol style={stepList}>
          {steps.map((s) => (
            <li key={s.n} style={stepItem}>
              <span style={stepNum}>{s.n}</span>
              <span>{s.t}</span>
            </li>
          ))}
        </ol>

        <a href={waLink} style={linkFallback}>{waLink.replace("https://", "")}</a>
        <PrintButton />
      </div>
    </div>
  );
}

const wrap = { minHeight: "100vh", margin: 0, background: "#eef1ee", color: "#12261d", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "28px" } as const;
const card = { width: "100%", maxWidth: 560, background: "#fff", border: "1px solid #dde3de", borderRadius: 22, padding: "40px 36px 34px", textAlign: "center" as const, boxShadow: "0 18px 50px rgba(11,61,46,.10)" };
const eyebrow = { fontSize: 12, letterSpacing: "0.18em", fontWeight: 700, color: "#2e7d5b" } as const;
const h1 = { margin: "12px 0 8px", fontSize: 30, lineHeight: 1.15, fontWeight: 800, textWrap: "balance" as const };
const sub = { margin: 0, fontSize: 16, color: "#5b6b62", maxWidth: 380, marginInline: "auto" } as const;
const qrBox = { display: "inline-flex", padding: 16, margin: "26px auto 6px", background: "#fff", border: "1px solid #e6ebe7", borderRadius: 18 } as const;
const stepList = { listStyle: "none", padding: 0, margin: "18px auto 4px", maxWidth: 340, textAlign: "left" as const, display: "grid", gap: 10 };
const stepItem = { display: "flex", alignItems: "center", gap: 12, fontSize: 15, color: "#243b30" } as const;
const stepNum = { flex: "0 0 auto", width: 26, height: 26, borderRadius: 999, background: "#0b3d2e", color: "#fff", fontSize: 14, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" } as const;
const linkFallback = { display: "block", marginTop: 20, fontSize: 13, color: "#7a877f", textDecoration: "none", wordBreak: "break-all" as const };

const printCss = `
@media print {
  .no-print { display: none !important; }
  body { background: #fff !important; }
}
@media (max-width: 480px) {
  h1 { font-size: 24px !important; }
}
`;
