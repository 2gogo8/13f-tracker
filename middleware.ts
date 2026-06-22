import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const PUBLIC_PATHS = [
  "/login",
  "/not-member",
  "/api/auth",
  "/api/sync-members",
  "/api/debug-env",
  "/view",
  "/api/anti-market-picks",
  "/api/slope-scanner",
  "/api/tw-slope",
  "/api/sector-performance",
  "/api/trending-news",
  "/api/market-sentiment",
  "/api/analyst-overview",
];

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public paths — do NOT run NextAuth check on these
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".svg") ||
    pathname === "/manifest.json"
  ) {
    return NextResponse.next();
  }

  // For everything else, check session
  const session = await auth();

  if (!session?.user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!session.user.isMember) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Discord server membership required" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/not-member", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
