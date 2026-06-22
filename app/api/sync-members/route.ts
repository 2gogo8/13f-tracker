/**
 * POST/GET /api/sync-members
 *
 * Previously used for YouTube membership sync.
 * No longer needed with Discord OAuth — membership is checked at login time.
 * Kept as a stub to avoid breaking Vercel Cron if configured.
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    message: "YouTube sync deprecated. Discord membership is checked at login.",
  });
}

export async function GET() {
  return NextResponse.json({
    message: "YouTube sync deprecated. Discord membership is checked at login.",
  });
}
