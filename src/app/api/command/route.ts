import { NextRequest, NextResponse } from "next/server";

import { runCherttCommand } from "@/lib/services/ai-service";
import { parseCommandRequestPayload } from "@/lib/services/command-engine/request-validator";
import { getSupabaseUserClient } from "@/lib/services/supabase-server";

async function getRequestingUser(request: NextRequest) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!token) return null;
  const client = getSupabaseUserClient(token);
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  return user ?? null;
}

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

  // Demo workspace is accessible without auth. All real workspaces require a session.
  const workspaceSlug = parsed.data.context?.workspaceSlug as string | undefined;
  if (workspaceSlug && workspaceSlug !== "global-hub") {
    const user = await getRequestingUser(request);
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
  }

  const result = await runCherttCommand(
    parsed.data.prompt,
    { ...parsed.data.context, history: parsed.data.history, memoryContext: parsed.data.memoryContext },
    parsed.data.confirmed,
  );
  return NextResponse.json(result);
}
