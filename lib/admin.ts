import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Returns the current session user if admin, else null.
 *
 * Admin check: relies on session.user.isAdmin which is computed in the JWT
 * callback and supports BOTH ADMIN_EMAILS (Google) and ADMIN_DISCORD_IDS (Discord).
 *
 * Returns null for:
 *  - unauthenticated requests (401 territory)
 *  - authenticated but non-admin users (403 territory)
 */
export async function requireAdmin(): Promise<{
  email: string | null;
  name: string | null | undefined;
  isMember: boolean;
} | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  if ((session.user as any).isAdmin !== true) return null;

  return {
    email: session.user.email ?? null,
    name: session.user.name,
    isMember: (session.user as any).isMember ?? false,
  };
}

/**
 * Returns 401 vs 403 context: distinguishes unauthenticated vs non-admin.
 * Use when you need to return the correct HTTP status.
 */
export async function checkAdminStatus(): Promise<
  { status: 'ok'; email: string | null; name: string | null | undefined; isMember: boolean } |
  { status: 'unauthenticated' } |
  { status: 'forbidden' }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { status: 'unauthenticated' };
  if ((session.user as any).isAdmin !== true) return { status: 'forbidden' };
  return {
    status: 'ok',
    email: session.user.email ?? null,
    name: session.user.name,
    isMember: (session.user as any).isMember ?? false,
  };
}

export function isAdminEmail(email: string): boolean {
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()).filter(Boolean) ?? [];
  return adminEmails.includes(email);
}
