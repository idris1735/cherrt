import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);

  // Keep only the chat surface for workspace routes:
  // /w/:workspaceSlug/chat
  if (segments[0] === "w" && segments.length >= 2) {
    const workspaceSlug = segments[1];
    const isChatRoute = segments[2] === "chat";

    if (!isChatRoute) {
      const url = request.nextUrl.clone();
      url.pathname = `/w/${workspaceSlug}/chat`;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/w/:path*"],
};

