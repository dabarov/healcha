"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * First-run screen shown until either a Google account is connected or demo
 * data exists. Two paths: set up the Google OAuth client and connect, or
 * seed demo data and explore.
 */
export default function Onboarding({ configured: configuredInitial }: { configured: boolean }) {
  const router = useRouter();
  // Resolved after mount: the redirect URI must match the origin the app is
  // actually served on (the desktop shell picks its own port).
  const [redirectUri, setRedirectUri] = useState("http://localhost:3000/api/auth/google/callback");
  useEffect(() => {
    setRedirectUri(`${window.location.origin}/api/auth/google/callback`);
  }, []);
  const [configured, setConfigured] = useState(configuredInitial);
  const [editing, setEditing] = useState(!configuredInitial);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "waiting" | "syncing" | "seeding">("idle");
  const polling = useRef(false);

  async function saveClient() {
    setError(null);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `HTTP ${res.status}`);
      return;
    }
    setConfigured(true);
    setEditing(false);
  }

  async function connect() {
    setError(null);
    setPhase("waiting");
    const res = await fetch("/api/auth/google/open", { method: "POST" });
    if (!res.ok) {
      setPhase("idle");
      setError("Could not open the browser — visit /api/auth/google/start manually.");
      return;
    }
    if (polling.current) return;
    polling.current = true;
    const poll = setInterval(async () => {
      const status = (await fetch("/api/setup")
        .then((r) => r.json())
        .catch(() => null)) as { connected?: boolean } | null;
      if (status?.connected) {
        clearInterval(poll);
        setPhase("syncing");
        await fetch("/api/sync", { method: "POST" }).catch(() => {});
        router.refresh();
      }
    }, 2000);
  }

  async function seedDemo() {
    setError(null);
    setPhase("seeding");
    const res = await fetch("/api/demo", { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setPhase("idle");
      setError(body?.error ?? `HTTP ${res.status}`);
      return;
    }
    router.refresh();
  }

  // A finished OAuth flow in another browser tab also lands the user here, so
  // keep an eye on the connection state even before "Connect" is clicked.
  useEffect(() => {
    if (configured || phase !== "idle") return;
    const t = setInterval(async () => {
      const status = (await fetch("/api/setup")
        .then((r) => r.json())
        .catch(() => null)) as { connected?: boolean } | null;
      if (status?.connected) router.refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [configured, phase, router]);

  const busy = phase === "syncing" || phase === "seeding";

  return (
    <div className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center gap-3.5 px-5 py-10">
      <header className="rise mb-2">
        <div className="head text-[26px] font-bold tracking-[-0.02em]" style={{ color: "var(--accent)" }}>
          healcha
        </div>
        <p className="mt-2 text-[15px]" style={{ color: "var(--mut)" }}>
          Your Fitbit data, on your machine. healcha pulls from the Google Health
          API into a local database, computes readiness and sleep baselines, and
          answers questions about your history — nothing leaves this computer.
        </p>
      </header>

      <section className="card rise rise-1 p-5">
        <div className="eyebrow mb-2">Step 1 · Google OAuth client</div>
        {configured && !editing ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm" style={{ color: "var(--mut)" }}>
              OAuth client saved.
            </span>
            <button className="btn btn-ghost" onClick={() => setEditing(true)}>
              Change
            </button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm" style={{ color: "var(--mut)" }}>
              The Google Health API needs an OAuth client that belongs to you —
              a free five-minute, one-time setup.
            </p>
            <details className="mb-3 text-sm" style={{ color: "var(--mut)" }}>
              <summary className="cursor-pointer" style={{ color: "var(--text)" }}>
                How to create one
              </summary>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                <li>
                  In the <b>Google Cloud Console</b>, create a project and enable the{" "}
                  <b>Health API</b> (APIs &amp; Services → Library).
                </li>
                <li>
                  OAuth consent screen: type <b>External</b>, publishing status{" "}
                  <b>Testing</b>, and add your own Google account as a test user.
                </li>
                <li>
                  Credentials → Create credentials → <b>OAuth client ID</b>, type{" "}
                  <b>Web application</b>, with this redirect URI:
                  <code
                    className="mt-1 block break-all rounded-md px-2 py-1 text-xs"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                  >
                    {redirectUri}
                  </code>
                </li>
                <li>
                  Make sure your Fitbit account is linked to that Google account
                  (Fitbit app → profile).
                </li>
              </ol>
            </details>
            <div className="flex flex-col gap-2">
              <input
                className="input"
                placeholder="Client ID (…apps.googleusercontent.com)"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
              <input
                className="input"
                placeholder="Client secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
              <button
                className="btn btn-accent self-start"
                onClick={saveClient}
                disabled={!clientId || !clientSecret}
              >
                Save
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card rise rise-2 p-5">
        <div className="eyebrow mb-2">Step 2 · Connect &amp; sync</div>
        <p className="mb-3 text-sm" style={{ color: "var(--mut)" }}>
          Approve read-only access in your browser; healcha then backfills the
          last 30 days and keeps syncing while the app is open.
        </p>
        <div className="flex items-center gap-3">
          <button className="btn btn-accent" onClick={connect} disabled={!configured || busy}>
            {phase === "waiting" ? "Waiting for Google…" : "Connect Google"}
          </button>
          {phase === "waiting" && (
            <span className="text-xs" style={{ color: "var(--faint)" }}>
              Approve access in the browser window that just opened.
            </span>
          )}
          {phase === "syncing" && (
            <span className="fade-in text-xs" style={{ color: "var(--accent)" }}>
              Connected — pulling your first 30 days…
            </span>
          )}
        </div>
      </section>

      <div className="rise rise-3 flex items-center gap-3 px-1">
        <span className="h-px flex-1" style={{ background: "var(--border)" }} />
        <span className="eyebrow">or</span>
        <span className="h-px flex-1" style={{ background: "var(--border)" }} />
      </div>

      <section className="card rise rise-4 flex items-center justify-between gap-3 p-5">
        <p className="text-sm" style={{ color: "var(--mut)" }}>
          No Fitbit handy? Look around with 60 days of generated data.
        </p>
        <button className="btn btn-ghost shrink-0" onClick={seedDemo} disabled={busy}>
          {phase === "seeding" ? "Generating…" : "Explore with demo data"}
        </button>
      </section>

      {error && (
        <p className="fade-in px-1 text-sm" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
