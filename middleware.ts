import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple pass-through middleware — auth is handled at the page/API level
// using auth() from lib/auth.ts in server components
export default function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
