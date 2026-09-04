"use client";

export function PrintButton() {
  return (
    <button
      className="no-print"
      onClick={() => window.print()}
      style={{ padding: "12px 20px", border: "none", borderRadius: 10, background: "#2563eb", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
    >
      🖨️ Print label
    </button>
  );
}
