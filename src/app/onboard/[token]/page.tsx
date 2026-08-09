import { resolveByToken } from "@/lib/services/kyc/applications";
import { OnboardForm } from "./onboard-form";
import s from "./onboard.module.css";

export const dynamic = "force-dynamic";

export default async function OnboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const app = await resolveByToken(token);
  if (!app) {
    return (
      <div className={s.shell}><div className={s.inner}><div className={s.card}>
        <h2 className={s.h1}>This link is invalid or expired</h2>
        <p className={s.sub}>Ask Chertt on WhatsApp to set up your church again to get a fresh link.</p>
      </div></div></div>
    );
  }
  return <OnboardForm token={token} />;
}
