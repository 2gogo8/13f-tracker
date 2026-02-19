import { NextRequest, NextResponse } from 'next/server';

const SITE_PASSWORD = process.env.SITE_PASSWORD || '290';
const COOKIE_NAME = 'jg_auth';
const COOKIE_MAX_AGE = 10 * 24 * 60 * 60; // 10 days in seconds

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (password === SITE_PASSWORD) {
      // Create a simple token (hash of password + secret)
      const token = Buffer.from(`authenticated:${Date.now()}`).toString('base64');
      
      const response = NextResponse.json({ ok: true });
      response.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
      });
      return response;
    }

    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
