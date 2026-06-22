/**
 * GET /api/membership-check
 *
 * Returns the current user's Discord server membership status from session.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    isMember: session.user.isMember ?? false,
    discordId: session.user.discordId ?? null,
  });
}
