import { resolveByToken } from "@/lib/services/kyc/applications";
import { OnboardForm } from "./onboard-form";

export const dynamic = "force-dynamic";

export default async function OnboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const app = await resolveByToken(token);
  if (!app) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui", background: "#0e1512", color: "#e8efe9", padding: 24 }}>
        <div style={{ maxWidth: 380, textAlign: "center" }}>
          <h2>This link is invalid or expired</h2>
          <p style={{ color: "#9baba0" }}>Ask Chertt on WhatsApp to set up your church again to get a fresh link.</p>
        </div>
      </div>
    );
  }
  return <OnboardForm token={token} />;
}
