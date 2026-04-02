import { NextRequest, NextResponse } from "next/server";

import { runCherttCommand } from "@/lib/services/ai-service";

export async function POST(request: NextRequest) {
  const { prompt } = (await request.json()) as { prompt?: string };

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const result = await runCherttCommand(prompt);
  return NextResponse.json(result);
}
