import { NextRequest, NextResponse } from "next/server";

import { runScheduledJobs } from "@/lib/services/cron/scheduler";

// Daily scheduled jobs, triggered by Vercel Cron (see vercel.json).
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
// set — we require it so the endpoint can't be triggered by anyone else.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  // Fail closed: if no secret is configured, refuse rather than run openly.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await runScheduledJobs();
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
}
