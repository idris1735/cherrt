/**
 * Skeleton shown while any toolkit sub-page loads.
 * Mirrors the tk-shell / tk-topbar / tk-body structure.
 */
export default function ToolkitLoading() {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--ch-bg, #f4f1ec)" }}>
      {/* Topbar skeleton */}
      <div
        style={{
          height: 50,
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--ch-border, #e9e1d9)",
          background: "var(--ch-surface, #fff)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="ch-skeleton" style={{ width: 26, height: 26, borderRadius: 7 }} />
          <div className="ch-skeleton" style={{ width: 90, height: 13, borderRadius: 4 }} />
        </div>
        <div className="ch-skeleton" style={{ width: 90, height: 13, borderRadius: 4 }} />
      </div>

      {/* Page body skeleton */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px 60px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Page header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="ch-skeleton" style={{ width: 140, height: 18, borderRadius: 5 }} />
            <div className="ch-skeleton" style={{ width: 200, height: 12, borderRadius: 4 }} />
          </div>
          <div className="ch-skeleton" style={{ width: 90, height: 36, borderRadius: 9 }} />
        </div>

        {/* Stats 2×2 grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="ch-skeleton"
              style={{ height: 70, borderRadius: 12 }}
            />
          ))}
        </div>

        {/* List rows */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            border: "1px solid var(--ch-border, #e5e5e5)",
            borderRadius: 14,
            overflow: "hidden",
            background: "var(--ch-surface, #fff)",
          }}
        >
          {[1, 0.85, 0.9, 0.75, 0.95, 0.8].map((op, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 16px",
                borderBottom: i < 5 ? "1px solid var(--ch-border, #f0f0f0)" : "none",
              }}
            >
              <div className="ch-skeleton" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                <div className="ch-skeleton" style={{ width: `${op * 55}%`, height: 13, borderRadius: 4 }} />
                <div className="ch-skeleton" style={{ width: `${op * 40}%`, height: 11, borderRadius: 4 }} />
              </div>
              <div className="ch-skeleton" style={{ width: 20, height: 20, borderRadius: 5 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
