import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    hasAdminKey: !!process.env.ADMIN_KEY,
    hasAuthSecret: !!process.env.AUTH_SECRET,
    hasCronSecret: !!process.env.CRON_SECRET,
    hasDiscordClientId: !!process.env.DISCORD_CLIENT_ID,
    hasDiscordClientSecret: !!process.env.DISCORD_CLIENT_SECRET,
    discordClientIdPrefix: process.env.DISCORD_CLIENT_ID?.substring(0,8) ?? "none",
  });
}
