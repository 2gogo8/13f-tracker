import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()).filter(Boolean) ?? [];
  const isAdmin = adminEmails.length > 0 && adminEmails.includes(session.user.email);
  const isMember = (session.user as any).isMember ?? false;

  return NextResponse.json({
    ok: true,
    email: session.user.email,
    name: session.user.name,
    isMember,
    isAdmin,
  });
}
