"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { StatusPill } from "@/components/shared/status-pill";

function LetterheadView({ title, body, preparedBy, workspace }: {
  title: string;
  body: string;
  preparedBy: string;
  workspace: { name: string; city: string };
}) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e0d9d0",
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    }}>
      {/* Letterhead header */}
      <div style={{
        padding: "20px 28px 16px",
        borderBottom: "3px solid var(--accent)",
        background: "var(--paper)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "1.1rem", letterSpacing: "-0.02em", color: "var(--accent)" }}>
            {workspace.name}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 2 }}>
            {workspace.city} · Official correspondence
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: "0.75rem", color: "var(--muted)" }}>
          <div>Ref: {title.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "")}-{Date.now().toString(36).slice(-4).toUpperCase()}</div>
          <div>{new Date().toLocaleDateString("en-NG", { day: "2-digit", month: "long", year: "numeric" })}</div>
        </div>
      </div>

      {/* Document body */}
      <div style={{ padding: "24px 28px 32px", fontFamily: "Georgia, serif" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 20, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {title}
        </h2>
        <div style={{ fontSize: "0.9rem", lineHeight: 1.75, whiteSpace: "pre-wrap", color: "#1a1a1a" }}>
          {body}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: "12px 28px",
        borderTop: "1px solid #e8e2da",
        background: "var(--paper)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "0.75rem",
        color: "var(--muted)",
      }}>
        <span>Prepared by: <strong>{preparedBy}</strong></span>
        <span>Powered by Chertt</span>
      </div>
    </div>
  );
}

function MemoView({ title, body, preparedBy, workspace }: {
  title: string;
  body: string;
  preparedBy: string;
  workspace: { name: string };
}) {
  const lines = body.split("\n");
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e0d9d0",
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    }}>
      <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid #e0d9d0", background: "var(--paper)" }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 6 }}>MEMORANDUM</div>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "4px 12px", fontSize: "0.85rem" }}>
          <span style={{ color: "var(--muted)", fontWeight: 600 }}>TO:</span><span>All Relevant Staff</span>
          <span style={{ color: "var(--muted)", fontWeight: 600 }}>FROM:</span><span>{preparedBy}</span>
          <span style={{ color: "var(--muted)", fontWeight: 600 }}>SUBJECT:</span><span style={{ fontWeight: 700 }}>{title}</span>
          <span style={{ color: "var(--muted)", fontWeight: 600 }}>DATE:</span>
          <span>{new Date().toLocaleDateString("en-NG", { day: "2-digit", month: "long", year: "numeric" })}</span>
        </div>
      </div>
      <div style={{ padding: "24px 28px 32px", fontFamily: "Georgia, serif", fontSize: "0.9rem", lineHeight: 1.75 }}>
        {lines.map((line, i) => {
          if (line.startsWith("## ")) return <h3 key={i} style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: "0.85rem", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 20, marginBottom: 8, color: "var(--accent)" }}>{line.slice(3)}</h3>;
          if (line.startsWith("- ")) return <div key={i} style={{ paddingLeft: 16, marginBottom: 4 }}>• {line.slice(2)}</div>;
          if (!line.trim()) return <div key={i} style={{ height: 10 }} />;
          return <p key={i} style={{ marginBottom: 0 }}>{line}</p>;
        })}
      </div>
    </div>
  );
}

function InvoiceView({ title, body, preparedBy, workspace }: {
  title: string;
  body: string;
  preparedBy: string;
  workspace: { name: string };
}) {
  const lines = body.split("\n");
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e0d9d0",
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    }}>
      <div style={{ padding: "20px 28px 16px", borderBottom: "3px solid var(--accent)", background: "var(--paper)", display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--accent)" }}>{workspace.name}</div>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", color: "var(--muted)", marginTop: 4 }}>INVOICE</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "0.8rem" }}>
          <div style={{ fontWeight: 700 }}># INV-{Date.now().toString(36).slice(-5).toUpperCase()}</div>
          <div style={{ color: "var(--muted)" }}>{new Date().toLocaleDateString("en-NG", { day: "2-digit", month: "long", year: "numeric" })}</div>
        </div>
      </div>
      <div style={{ padding: "24px 28px 32px", fontFamily: "Georgia, serif", fontSize: "0.9rem", lineHeight: 1.75 }}>
        {lines.map((line, i) => {
          if (line.startsWith("## ")) return <h3 key={i} style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: "0.85rem", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 20, marginBottom: 8, color: "var(--accent)" }}>{line.slice(3)}</h3>;
          if (line.startsWith("- ")) return <div key={i} style={{ paddingLeft: 16, marginBottom: 4 }}>• {line.slice(2)}</div>;
          if (!line.trim()) return <div key={i} style={{ height: 10 }} />;
          return <p key={i} style={{ marginBottom: 0 }}>{line}</p>;
        })}
      </div>
      <div style={{ padding: "12px 28px", borderTop: "1px solid #e8e2da", background: "var(--paper)", display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--muted)" }}>
        <span>Prepared by: <strong>{preparedBy}</strong></span>
        <span>{workspace.name}</span>
      </div>
    </div>
  );
}

export default function ToolkitDocumentDetailPage() {
  const params = useParams<{ workspaceSlug: string; documentId: string }>();
  const { snapshot } = useAppState();
  const base = `/w/${params.workspaceSlug}/modules/toolkit`;
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const document = snapshot.documents.find((item) => item.id === params.documentId);

  if (!document) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={`${base}/documents`}>← Documents</Link>
          </div>
          <p className="tk-eyebrow">Smart document</p>
          <h2 className="tk-card-title">Document not found</h2>
        </div>
      </div>
    );
  }

  const wsProps = { name: snapshot.workspace.name, city: snapshot.workspace.city };

  return (
    <div className="tk-page">
      <div className="tk-card no-print">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={`${base}/documents`}>← Documents</Link>
          <StatusPill status={document.status} />
        </div>
        <p className="tk-eyebrow">Smart document · {document.type}</p>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 4, marginBottom: 0 }}>
          ⚠️ AI-drafted — review all details carefully before official use. Chertt is not a substitute for legal or professional advice.
        </p>

        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Prepared by</span>
            <strong>{document.preparedBy}</strong>
          </div>
          {document.awaitingSignatureFrom && (
            <div className="tk-detail-stat">
              <span>Awaiting signature</span>
              <strong>{document.awaitingSignatureFrom}</strong>
            </div>
          )}
          {document.signedBy && (
            <div className="tk-detail-stat">
              <span>Signed by</span>
              <strong>{document.signedBy}</strong>
            </div>
          )}
          <div className="tk-detail-stat">
            <span>Created</span>
            <strong>{document.createdAtLabel}</strong>
          </div>
        </div>
      </div>

      {/* Document preview with letterhead */}
      {document.body ? (
        document.type === "letter" ? (
          <LetterheadView title={document.title} body={document.body} preparedBy={document.preparedBy} workspace={wsProps} />
        ) : document.type === "memo" ? (
          <MemoView title={document.title} body={document.body} preparedBy={document.preparedBy} workspace={wsProps} />
        ) : (
          <InvoiceView title={document.title} body={document.body} preparedBy={document.preparedBy} workspace={wsProps} />
        )
      ) : (
        <div className="tk-card">
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No document body available.</p>
        </div>
      )}

      <div className="tk-card no-print">
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Edit in chat →</Link>
          <button className="button button--ghost" onClick={() => window.print()}>Download PDF</button>
          <Link className="button button--ghost" href={`${base}/documents`}>All documents</Link>
        </div>
      </div>
    </div>
  );
}
