import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Protected routes. Unauthenticated access is handled differently depending
 * on the request type:
 *
 * - Normal browser navigation → 307 redirect to /api/auth/login, which sends
 *   the user to Cognito Managed Login.
 * - RSC / client-navigation fetch (RSC: 1 header) → 401 with no Location.
 *
 * The distinction matters because a fetch() cannot follow the redirect chain
 * /dashboard → /api/auth/login → Cognito: it ends at a cross-origin response
 * without CORS headers, so the browser blocks it and the router reports
 * "Failed to fetch RSC payload". Returning 401 makes Next.js abandon client
 * navigation and perform a full browser navigation instead, which then hits
 * the same protected route as a normal request and redirects to Cognito
 * correctly.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Define protected routes
  const protectedRoutes = ["/dashboard", "/matches", "/notifications", "/profile", "/lost", "/found"];

  // Check if the current path is a protected route
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));

  if (isProtected) {
    const accessToken = request.cookies.get("access_token")?.value;

    if (!accessToken) {
      // Client navigation (RSC payload fetch): fail fast so Next.js falls
      // back to full browser navigation instead of chasing a cross-origin
      // login redirect chain.
      if (request.headers.get("RSC") === "1") {
        return new NextResponse(null, { status: 401 });
      }

      // Normal browser navigation: send the user to Cognito Managed Login.
      const loginUrl = new URL("/api/auth/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|public).*)",
  ],
};
