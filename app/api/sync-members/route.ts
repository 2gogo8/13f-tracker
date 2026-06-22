export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { syncMembers, SYNC_LOCK_KEY } from "@/lib/youtube-members";
import { acquireLock, releaseLock } from "@/lib/redis";

/**
 * POST/GET /api/sync-members
 *
 * Trigger a YouTube membership sync.
 * Protected by bearer token (CRON_SECRET or NEXTAUTH_SECRET).
 * GET is supported for Vercel Cron (which sends GET by default).
 */

function authorize(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization") ?? "";
  const keys = [
    process.env.CRON_SECRET,
    process.env.NEXTAUTH_SECRET,
    process.env.AUTH_SECRET,
    process.env.ADMIN_KEY,
  ].filter(Boolean);
  for (const key of keys) {
    if (authHeader === `Bearer ${key}`) return true;
  }
  return false;
}

async function handleSync(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locked = await acquireLock(SYNC_LOCK_KEY, 60);
  if (!locked) {
    return NextResponse.json(
      { error: "Sync already in progress" },
      { status: 429 }
    );
  }

  try {
    const result = await syncMembers();
    return NextResponse.json(result);
  } finally {
    await releaseLock(SYNC_LOCK_KEY);
  }
}

export async function POST(request: NextRequest) {
  return handleSync(request);
}

export async function GET(request: NextRequest) {
  return handleSync(request);
}
