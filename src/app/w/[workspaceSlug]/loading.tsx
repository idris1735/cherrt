/**
 * Shown by Next.js Suspense while any workspace page is loading.
 * Uses global ch-skeleton class + html-level --ch-* vars (set by inline script).
 */
export default function WorkspaceLoading() {
  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateColumns: "260px minmax(0,1fr)",
        background: "var(--ch-bg, oklch(0.17 0.01 40))",
        overflow: "hidden",
      }}
    >
      <style>{`@media(max-width:900px){#wl-sidebar{display:none}#wl-main{grid-column:1/-1}}`}</style>
      {/* Sidebar */}
      <aside
        id="wl-sidebar"
        style={{
          borderRight: "1px solid var(--ch-border, oklch(0.37 0.01 40 / 0.45))",
          background: "var(--ch-surface, oklch(0.2 0.01 40))",
          padding: "14px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="ch-skeleton" style={{ width: 22, height: 22, borderRadius: 6 }} />
            <div className="ch-skeleton" style={{ width: 56, height: 13, borderRadius: 4 }} />
          </div>
          <div className="ch-skeleton" style={{ width: 28, height: 28, borderRadius: 7 }} />
        </div>

        {/* New chat button */}
        <div className="ch-skeleton" style={{ height: 36, borderRadius: 9 }} />

        {/* Search */}
        <div className="ch-skeleton" style={{ height: 32, borderRadius: 8 }} />

        {/* History rows — varied widths feel natural */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 4, flex: 1 }}>
          {["82%", "68%", "91%", "74%", "59%", "85%", "63%", "77%"].map((w, i) => (
            <div
              key={i}
              className="ch-skeleton"
              style={{ height: 34, borderRadius: 8, width: w }}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6 }}>
          <div className="ch-skeleton" style={{ width: 30, height: 30, borderRadius: "50%" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
            <div className="ch-skeleton" style={{ height: 12, width: "60%", borderRadius: 4 }} />
            <div className="ch-skeleton" style={{ height: 10, width: "40%", borderRadius: 4 }} />
          </div>
        </div>
      </aside>

      {/* Main area */}
      <main
        id="wl-main"
        style={{
          background: "var(--ch-bg, oklch(0.17 0.01 40))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt=""
          width={36}
          height={36}
          style={{ borderRadius: 9, opacity: 0.55 }}
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div className="ch-skeleton" style={{ width: 160, height: 16, borderRadius: 5 }} />
          <div className="ch-skeleton" style={{ width: 100, height: 12, borderRadius: 4 }} />
        </div>
      </main>
    </div>
  );
}
