import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    hasAdminKey: !!process.env.ADMIN_KEY,
    hasAuthSecret: !!process.env.AUTH_SECRET,
    hasCronSecret: !!process.env.CRON_SECRET,
    adminKeyLen: process.env.ADMIN_KEY?.length ?? 0,
    adminKeyPrefix: process.env.ADMIN_KEY?.substring(0,6) ?? "none",
  });
}
