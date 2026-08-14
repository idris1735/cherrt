"use client";
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../use-admin-fetch";
import { toast } from "@/components/admin/toast";

export default function SettingsPage() {
  const [allowlist, setAllowlist] = useState<string[] | null>(null);
  const [superAdmin, setSuperAdmin] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [health, setHealth] = useState<{ resend: { configured: boolean; domains: string[]; note: string }; mono: { configured: boolean; probe: string }; whatsapp: { configured: boolean; note: string } } | null>(null);

  useEffect(() => {
    adminFetch<{ allowlist: string[]; superAdmin: string | null }>("/api/admin/settings").then((r) => {
      if (r.status === 401) setErr(true);
      else {
        setAllowlist(r.data?.allowlist ?? []);
        setSuperAdmin(r.data?.superAdmin ?? null);
      }
    });
    adminFetch<{ resend: { configured: boolean; domains: string[]; note: string }; mono: { configured: boolean; probe: string }; whatsapp: { configured: boolean; note: string } }>("/api/admin/kyc-health")
      .then((r) => { if (r.status === 200 && r.data) setHealth(r.data); })
      .catch(() => {});
    const saved = document.documentElement.getAttribute("data-theme") as "light" | "dark" | null;
    if (saved) setTheme(saved);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      window.localStorage.setItem("chertt-theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }, []);

  if (err) return <div className="page"><div className="error-box">🔒 Not authorized.</div></div>;
  if (!allowlist) return <div className="page"><div className="skeleton" style={{ height: 200 }} /></div>;

  return (
    <div className="page animate-in">
      <div className="page-header">
        <div>
          <div className="breadcrumbs"><span>System</span><span className="sep">/</span><span>Settings</span></div>
          <h1>Settings</h1>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 800 }} className="charts-grid-2">
        <div className="card">
          <div className="card-header"><h3>Admin Allowlist</h3></div>
          <div className="card-body">
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Read-only — managed via the PLATFORM_ADMIN_EMAILS environment variable.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {allowlist.map((email) => (
                <div key={email} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "var(--surface-muted)", borderRadius: "var(--radius-sm)" }}>
                  <span style={{ fontSize: 13 }}>{email}</span>
                  <span className={`badge ${email === superAdmin ? "badge-success" : "badge-info"}`}>{email === superAdmin ? "Super Admin" : "Admin"}</span>
                </div>
              ))}
              {allowlist.length === 0 && <p style={{ color: "var(--muted)" }}>No admins configured.</p>}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>Appearance</h3></div>
          <div className="card-body">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>Theme</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Toggle between light and dark mode</div>
              </div>
              <button className="btn btn-sm" onClick={() => { toggleTheme(); toast(theme === "light" ? "Dark mode enabled" : "Light mode enabled"); }}>Toggle</button>
            </div>
          </div>
        </div>
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header"><h3>Third-party connections</h3></div>
          <div className="card-body">
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Checked live from the production runtime — no secret values are shown.</p>
            {!health && <div className="skeleton" style={{ height: 80 }} />}
            {health && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span className={`badge ${health.resend.configured && health.resend.domains.length > 0 ? "badge-success" : "badge-warning"}`}>
                    {health.resend.configured && health.resend.domains.length > 0 ? "OK" : "CHECK"}
                  </span>
                  <b>Resend (email codes)</b>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>{health.resend.domains.length > 0 ? `Verified: ${health.resend.domains.join(", ")}` : health.resend.note}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span className={`badge ${health.mono.configured && health.mono.probe.includes("OK") ? "badge-success" : "badge-warning"}`}>
                    {health.mono.configured && health.mono.probe.includes("OK") ? "OK" : "CHECK"}
                  </span>
                  <b>Mono (CAC / NIN lookups)</b>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>{health.mono.probe}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span className={`badge ${health.whatsapp.configured ? "badge-success" : "badge-warning"}`}>
                    {health.whatsapp.configured ? "OK" : "CHECK"}
                  </span>
                  <b>WhatsApp Cloud API</b>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>{health.whatsapp.note}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}