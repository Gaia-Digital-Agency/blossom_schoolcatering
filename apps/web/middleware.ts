import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, ROLE_COOKIE, Role } from './lib/auth';

const BASE_PATH = '/schoolcatering';

/**
 * Determines the required role for a given path.
 * It checks if the path corresponds to a protected area for a specific role
 * (e.g., /admin, /kitchen) and returns the required role.
 * @param path The URL path to check.
 * @returns The required role ('ADMIN', 'KITCHEN', 'DELIVERY', 'PARENT', 'YOUNGSTER') or null if no specific role is required.
 */
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

/**
 * Returns the login path for a specific role.
 * @param role The role for which to get the login path.
 * @returns The login path string (e.g., '/admin/login').
 */
function roleLoginPath(role: Role) {
  if (role === 'ADMIN') return '/admin/login';
  if (role === 'KITCHEN') return '/kitchen/login';
  if (role === 'DELIVERY') return '/delivery/login';
  if (role === 'PARENT') return '/parent/login';
  return '/youngster/login';
}

/**
 * The main middleware function for the Next.js application.
 * It handles authentication and authorization for all incoming requests
 * based on cookies and the requested path.
 * @param request The incoming Next.js request.
 * @returns A NextResponse that either continues to the requested page or redirects the user.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Normalize the path by removing the base path if it exists.
  const normalizedPath = pathname.startsWith(BASE_PATH)
    ? pathname.slice(BASE_PATH.length) || '/'
    : pathname;

  // Get authentication status and user role from cookies.
  const hasToken = Boolean(request.cookies.get(AUTH_COOKIE)?.value);
  const role = request.cookies.get(ROLE_COOKIE)?.value as Role | undefined;
  const requiredRole = getRequiredRole(normalizedPath);

  // Check if the path is for the rating page, which has special logic.
  const isRatingPath = normalizedPath === '/rating' || normalizedPath.startsWith('/rating/');

  // Define public paths that do not require authentication.
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

  // Special handling for rating paths.
  if (isRatingPath) {
    if (!hasToken) {
      return NextResponse.redirect(new URL(`${BASE_PATH}/login`, request.url));
    }
    // Only PARENT and YOUNGSTER roles can access rating paths.
    if (role !== 'PARENT' && role !== 'YOUNGSTER') {
      const destination = role === 'ADMIN'
        ? '/admin'
        : role === 'KITCHEN'
          ? '/kitchen'
          : role === 'DELIVERY'
            ? '/delivery'
            : '/login';
      return NextResponse.redirect(new URL(`${BASE_PATH}${destination}`, request.url));
    }
    return NextResponse.next();
  }

  // Handle role-specific login pages.
  if (requiredRole && normalizedPath === roleLoginPath(requiredRole)) {
    // If user is already logged in with the correct role, redirect them to their dashboard.
    if (hasToken && role === requiredRole) {
      const destination = requiredRole === 'PARENT'
        ? '/parent/orders'
        : requiredRole === 'YOUNGSTER'
          ? '/youngster'
          : `/${requiredRole.toLowerCase()}`;
      return NextResponse.redirect(new URL(`${BASE_PATH}${destination}`, request.url));
    }
    return NextResponse.next();
  }

  // For paths that require a specific role, check for authentication and correct role.
  if (requiredRole) {
    if (!hasToken || role !== requiredRole) {
      // If not authenticated or wrong role, redirect to the correct login page.
      return NextResponse.redirect(new URL(`${BASE_PATH}${roleLoginPath(requiredRole)}`, request.url));
    }
    return NextResponse.next();
  }

  // For any other non-public path, require a token.
  if (!hasToken && !isPublic) {
    return NextResponse.redirect(new URL(`${BASE_PATH}/login`, request.url));
  }

  // If a logged-in user tries to access the main login page, redirect them to their dashboard.
  if (hasToken && normalizedPath === '/login') {
    const destination = role === 'PARENT'
      ? '/parent/orders'
      : role === 'YOUNGSTER'
        ? '/youngster'
        : role === 'ADMIN'
          ? '/admin'
          : role === 'KITCHEN'
            ? '/kitchen'
            : role === 'DELIVERY'
              ? '/delivery'
              : '/dashboard';
    return NextResponse.redirect(new URL(`${BASE_PATH}${destination}`, request.url));
  }

  // If none of the above conditions are met, allow the request to proceed.
  return NextResponse.next();
}

/**
 * Configuration for the middleware.
 * The `matcher` property specifies that this middleware should run on all paths
 * except for those that are part of the Next.js framework (`_next`) or are static files.
 */
export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
