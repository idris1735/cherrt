import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseUserClient } from "@/lib/services/supabase-server";

async function verifyUser(request: NextRequest) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!token) return null;
  const client = getSupabaseUserClient(token);
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  return user ?? null;
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServerClient();
  if (!db) return NextResponse.json({ phone: null });

  const { data } = await db
    .from("whatsapp_phone_links")
    .select("phone_number")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ phone: data?.phone_number ?? null });
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    phoneNumber: string;
    workspaceId: string;
    workspaceSlug: string;
    workspaceName: string;
    userName: string;
    userRole: string;
  };

  const raw = body.phoneNumber?.replace(/[\s\-().+]/g, "");
  if (!raw || raw.length < 7) {
    return NextResponse.json({ error: "A valid phone number is required." }, { status: 400 });
  }
  // Ensure it starts with country code (no leading zero)
  const normalized = raw.startsWith("0") ? `234${raw.slice(1)}` : raw;

  const db = getSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });

  // Remove any previous link for this user before creating the new one
  await db.from("whatsapp_phone_links").delete().eq("user_id", user.id);

  const { error } = await db.from("whatsapp_phone_links").insert({
    phone_number: normalized,
    user_id: user.id,
    workspace_id: body.workspaceId,
    workspace_slug: body.workspaceSlug,
    workspace_name: body.workspaceName,
    user_name: body.userName,
    user_role: body.userRole,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This phone number is already linked to another Chertt account." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Failed to link WhatsApp number." }, { status: 500 });
  }

  return NextResponse.json({ success: true, phone: normalized });
}

export async function DELETE(request: NextRequest) {
  const user = await verifyUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });

  await db.from("whatsapp_phone_links").delete().eq("user_id", user.id);

  return NextResponse.json({ success: true });
}
