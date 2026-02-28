import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, ROLE_COOKIE, Role } from './lib/auth';

const BASE_PATH = '/schoolcatering';

function getRequiredRole(path: string): Role | null {
  if (path === '/admin' || path.startsWith('/admin/')) return 'ADMIN';
  if (path === '/kitchen' || path.startsWith('/kitchen/')) return 'KITCHEN';
  if (path === '/delivery' || path.startsWith('/delivery/')) return 'DELIVERY';
  if (path === '/parents' || path.startsWith('/parents/') || path === '/parent' || path.startsWith('/parent/')) {
    return 'PARENT';
  }
  if (
    path === '/youngsters' ||
    path.startsWith('/youngsters/') ||
    path === '/youngster' ||
    path.startsWith('/youngster/')
  ) {
    return 'YOUNGSTER';
  }
  return null;
}

function roleLoginPath(role: Role) {
  if (role === 'ADMIN') return '/admin/login';
  if (role === 'KITCHEN') return '/kitchen/login';
  if (role === 'DELIVERY') return '/delivery/login';
  if (role === 'PARENT') return '/parent/login';
  return '/youngster/login';
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const normalizedPath = pathname.startsWith(BASE_PATH)
    ? pathname.slice(BASE_PATH.length) || '/'
    : pathname;

  const hasToken = Boolean(request.cookies.get(AUTH_COOKIE)?.value);
  const role = request.cookies.get(ROLE_COOKIE)?.value as Role | undefined;
  const isRatingPath = normalizedPath === '/rating' || normalizedPath.startsWith('/rating/');
  const requiredRole = getRequiredRole(normalizedPath);
  const isPublic =
    normalizedPath === '/' ||
    normalizedPath === '/menu' ||
    normalizedPath.startsWith('/menu/') ||
    normalizedPath === '/guide' ||
    normalizedPath.startsWith('/guide/') ||
    normalizedPath === '/login' ||
    normalizedPath === '/register' ||
    normalizedPath.startsWith('/register/') ||
    normalizedPath === '/admin/login' ||
    normalizedPath === '/kitchen/login' ||
    normalizedPath === '/delivery/login' ||
    normalizedPath === '/parent/login' ||
    normalizedPath === '/youngster/login';

  if (isRatingPath) {
    if (!hasToken || (role !== 'PARENT' && role !== 'YOUNGSTER')) {
      return NextResponse.redirect(new URL(`${BASE_PATH}/login`, request.url));
    }
    return NextResponse.next();
  }

  if (requiredRole && normalizedPath === roleLoginPath(requiredRole)) {
    if (hasToken && role === requiredRole) {
      const destination = requiredRole === 'PARENT'
        ? '/parents'
        : requiredRole === 'YOUNGSTER'
          ? '/youngsters'
          : `/${requiredRole.toLowerCase()}`;
      return NextResponse.redirect(new URL(`${BASE_PATH}${destination}`, request.url));
    }
    return NextResponse.next();
  }

  if (requiredRole) {
    if (!hasToken || role !== requiredRole) {
      return NextResponse.redirect(new URL(`${BASE_PATH}${roleLoginPath(requiredRole)}`, request.url));
    }
    return NextResponse.next();
  }

  if (!hasToken && !isPublic) {
    return NextResponse.redirect(new URL(`${BASE_PATH}/login`, request.url));
  }

  if (hasToken && normalizedPath === '/login') {
    const destination = role === 'PARENT'
      ? '/parents'
      : role === 'YOUNGSTER'
        ? '/youngsters'
        : role === 'ADMIN'
          ? '/admin'
          : role === 'KITCHEN'
            ? '/kitchen'
            : role === 'DELIVERY'
              ? '/delivery'
              : '/dashboard';
    return NextResponse.redirect(new URL(`${BASE_PATH}${destination}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
