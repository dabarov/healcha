import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, dashboardToken } from "@/lib/authToken";
import { env } from "@/lib/env";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const secret = env("DASHBOARD_SECRET");
  if (password !== secret) {
    return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
  }
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(AUTH_COOKIE, await dashboardToken(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });
  return res;
}
