import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, dashboardToken } from "@/lib/authToken";

/**
 * Gates the whole app behind DASHBOARD_SECRET — the Vercel URL is public,
 * health data must not be. Accepted credentials:
 *   - session cookie (set by the /login form)
 *   - x-dashboard-secret header or ?key= query param (for scripts; sets the cookie)
 * The Telegram webhook and Google OAuth callback have their own auth and are
 * excluded via the matcher below.
 */
export async function middleware(req: NextRequest) {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) {
    return new NextResponse("DASHBOARD_SECRET is not configured", { status: 500 });
  }
  const expected = await dashboardToken(secret);

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie === expected) return NextResponse.next();

  const provided =
    req.headers.get("x-dashboard-secret") ?? req.nextUrl.searchParams.get("key");
  if (provided === secret) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("key");
    const res = NextResponse.redirect(url);
    res.cookies.set(AUTH_COOKIE, expected, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 90,
      path: "/",
    });
    return res;
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    /*
     * Everything except:
     * - /login + /api/auth/login (the gate itself)
     * - /api/telegram (authenticated via Telegram's secret-token header)
     * - /api/auth/google/* (OAuth flow; protected by state check)
     * - Next.js internals / static files
     */
    "/((?!login|api/auth/login|api/telegram|api/auth/google|_next/static|_next/image|favicon.ico).*)",
  ],
};
