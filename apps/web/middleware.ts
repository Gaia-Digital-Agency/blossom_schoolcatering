import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE } from './lib/auth';

const BASE_PATH = '/schoolcatering';
const PUBLIC_PATHS = new Set(['/', '/login']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const normalizedPath = pathname.startsWith(BASE_PATH)
    ? pathname.slice(BASE_PATH.length) || '/'
    : pathname;

  const hasToken = Boolean(request.cookies.get(AUTH_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.has(normalizedPath);

  if (!hasToken && !isPublic) {
    return NextResponse.redirect(new URL(`${BASE_PATH}/login`, request.url));
  }

  if (hasToken && normalizedPath === '/login') {
    return NextResponse.redirect(new URL(`${BASE_PATH}/dashboard`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
