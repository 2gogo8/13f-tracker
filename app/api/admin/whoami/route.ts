import { getToken } from 'next-auth/jwt';
import { type NextRequest, NextResponse } from 'next/server';

// Use getToken() to access the JWT server-side (includes discordId which is not in client session)
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin check: Option C — support both ADMIN_EMAILS and ADMIN_DISCORD_IDS
  const adminEmails =
    process.env.ADMIN_EMAILS?.split(',').map((e) => e.trim()).filter(Boolean) ?? [];
  const adminDiscordIds =
    process.env.ADMIN_DISCORD_IDS?.split(',').map((e) => e.trim()).filter(Boolean) ?? [];

  const isAdminByEmail =
    typeof token.email === 'string' && adminEmails.includes(token.email);
  const isAdminByDiscord =
    typeof token.discordId === 'string' && adminDiscordIds.includes(token.discordId as string);
  const isAdmin = isAdminByEmail || isAdminByDiscord;

  const isMember = (token.isMember as boolean) ?? false;

  return NextResponse.json({
    ok: true,
    name: token.name ?? null,
    email: token.email ?? null,       // null for Discord logins (no email scope)
    discordId: token.discordId ?? null,
    isMember,
    isAdmin,
  });
}
