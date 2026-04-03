import { NextRequest, NextResponse } from "next/server";

import { runCherttCommand } from "@/lib/services/ai-service";
import { parseCommandRequestPayload } from "@/lib/services/command-engine/request-validator";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = parseCommandRequestPayload(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await runCherttCommand(parsed.data.prompt, parsed.data.context);
  return NextResponse.json(result);
}
