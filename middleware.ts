import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Paths that are always accessible without authentication.
 */
const PUBLIC_PATHS = [
  "/login",
  "/not-member",
  "/api/auth", // NextAuth routes
  "/api/sync-members", // Cron endpoint (has its own auth)
  // Public view page
  "/view",
  // Public API routes
  "/api/anti-market-picks",
  "/api/slope-scanner",
  "/api/tw-slope",
  "/api/sector-performance",
  "/api/trending-news",
  "/api/market-sentiment",
  "/api/analyst-overview",
];

export default auth((request) => {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
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

  const session = request.auth;

  // Not authenticated → redirect to login (or 401 for API)
  if (!session?.user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated but not a member → redirect to not-member page
  if (!session.user.isMember) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "YouTube membership required" },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/not-member", request.url));
  }

  // Authenticated + member → proceed
  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
