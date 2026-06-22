/**
 * GET /api/membership-check
 *
 * Re-checks the current user's YouTube membership status.
 * Called client-side to refresh membership after login.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isMember } from "@/lib/youtube-members";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const ytChannelId = session.user.ytChannelId;
  const memberStatus = ytChannelId ? await isMember(ytChannelId) : false;

  return NextResponse.json({
    isMember: memberStatus,
    ytChannelId: ytChannelId ?? null,
  });
}
