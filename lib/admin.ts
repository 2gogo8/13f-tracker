import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Returns the current session user email if admin, else null.
 * Admin check: email must be in ADMIN_EMAILS env var (comma-separated).
 * If ADMIN_EMAILS is not set, nobody is admin.
 */
export async function requireAdmin(): Promise<{ email: string; name: string | null | undefined; isMember: boolean } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()).filter(Boolean) ?? [];
  if (adminEmails.length === 0) return null;
  if (!adminEmails.includes(session.user.email)) return null;

  return {
    email: session.user.email,
    name: session.user.name,
    isMember: (session.user as any).isMember ?? false,
  };
}

export function isAdminEmail(email: string): boolean {
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()).filter(Boolean) ?? [];
  return adminEmails.includes(email);
}
