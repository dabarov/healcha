import { spawn, type ChildProcess } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import { buildAuthUrl, createOauthState } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

/**
 * Opens the Google consent screen in the system browser. Google blocks OAuth
 * inside embedded webviews, so the desktop shell can't run the flow in its
 * own window — the local server opens the default browser instead.
 *
 * Each branch spawns a literal command name: with a dynamic command Next's
 * file tracer globs the entire project into the standalone output.
 */
function openInBrowser(url: string): ChildProcess {
  const opts = { detached: true, stdio: "ignore" } as const;
  if (process.platform === "darwin") return spawn("open", [url], opts);
  if (process.platform === "win32") return spawn("cmd", ["/c", "start", "", url], opts);
  return spawn("xdg-open", [url], opts);
}

export async function POST(req: NextRequest) {
  const redirectUri = `${req.nextUrl.origin}/api/auth/google/callback`;
  const url = buildAuthUrl(redirectUri, createOauthState());
  try {
    openInBrowser(url).unref();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), url },
      { status: 500 },
    );
  }
}
