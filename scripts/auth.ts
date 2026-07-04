import "dotenv/config";
import { createServer } from "http";
import { buildAuthUrl, exchangeCode } from "../src/lib/google/oauth";

/**
 * One-time local OAuth flow: starts a throwaway server on :8787, prints the
 * consent URL, exchanges the returned code and stores the (encrypted)
 * refresh token in Turso.
 *
 * Requires http://localhost:8787/oauth/callback to be registered as a
 * redirect URI on the Google OAuth client.
 */
const REDIRECT_URI = "http://localhost:8787/oauth/callback";

async function main() {
  const url = buildAuthUrl(REDIRECT_URI);

  const server = createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://localhost:8787");
    if (u.pathname !== "/oauth/callback") {
      res.writeHead(404).end();
      return;
    }
    const code = u.searchParams.get("code");
    const err = u.searchParams.get("error");
    if (err || !code) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end(`OAuth error: ${err ?? "missing code"}`);
      console.error(`OAuth error: ${err ?? "missing code"}`);
      process.exit(1);
    }
    try {
      await exchangeCode(code, REDIRECT_URI);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Connected! Refresh token stored (encrypted). You can close this tab.");
      console.log("✅ Tokens stored in Turso. You're ready to run: npm run sync");
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(String(e));
      console.error(e);
      process.exitCode = 1;
    } finally {
      server.close();
    }
  });

  server.listen(8787, () => {
    console.log("Open this URL in your browser and approve access:\n");
    console.log(url);
    console.log("\nWaiting for the OAuth redirect on http://localhost:8787 …");
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
