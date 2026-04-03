import { NextRequest, NextResponse } from "next/server";

import { runCherttCommand } from "@/lib/services/ai-service";
import type { ModuleKey, Role } from "@/lib/types";

export async function POST(request: NextRequest) {
  const { prompt, context } = (await request.json()) as {
    prompt?: string;
    context?: {
      role?: Role;
      enabledModules?: ModuleKey[];
    };
  };

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const result = await runCherttCommand(prompt, context);
  return NextResponse.json(result);
}
