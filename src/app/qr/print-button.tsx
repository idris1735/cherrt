"use client";

// Tiny client island so the print action works from the otherwise-server poster.
export function PrintButton() {
  return (
    <button
      type="button"
      className="no-print"
      onClick={() => window.print()}
      style={{
        marginTop: 28,
        padding: "12px 22px",
        border: "1px solid #0b3d2e",
        borderRadius: 999,
        background: "#0b3d2e",
        color: "#fff",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      Print this poster
    </button>
  );
}
