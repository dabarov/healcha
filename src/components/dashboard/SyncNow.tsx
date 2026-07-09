"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const STALE_AFTER_MS = 3 * 60 * 60 * 1000; // auto-sync when older than 3h

/**
 * Header sync control. Besides the manual button, it keeps data fresh while
 * the app is open (on mount and every 15 min it syncs if the last sync is
 * over 3h old), and turns into a "Reconnect Google" button when the server
 * reports the OAuth grant has expired.
 */
export default function SyncNow({
  connected,
  lastSyncAt,
}: {
  connected: boolean;
  lastSyncAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const sync = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (res.status === 409) {
        setNeedsReauth(true);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setNeedsReauth(false);
      fetch("/api/summary?refresh=1").catch(() => {});
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [router]);

  async function reconnect() {
    setError(null);
    await fetch("/api/auth/google/open", { method: "POST" }).catch(() => {});
    const poll = setInterval(async () => {
      const status = (await fetch("/api/setup")
        .then((r) => r.json())
        .catch(() => null)) as { connected?: boolean } | null;
      if (status?.connected) {
        clearInterval(poll);
        setNeedsReauth(false);
        sync();
      }
    }, 2000);
    setTimeout(() => clearInterval(poll), 5 * 60 * 1000);
  }

  const lastSyncRef = useRef(lastSyncAt);
  lastSyncRef.current = lastSyncAt;

  useEffect(() => {
    if (!connected) return;
    const maybeSync = () => {
      const at = lastSyncRef.current;
      if (at == null || Date.now() - new Date(at).getTime() > STALE_AFTER_MS) sync();
    };
    maybeSync();
    const t = setInterval(maybeSync, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, [connected, sync]);

  return (
    <div className="flex items-center gap-3">
      {error && (
        <span className="hidden max-w-[220px] truncate text-xs sm:block" style={{ color: "var(--bad)" }}>
          Sync failed: {error}
        </span>
      )}
      {needsReauth ? (
        <button className="btn btn-accent" onClick={reconnect}>
          Reconnect Google
        </button>
      ) : (
        <button className="btn btn-accent" onClick={sync} disabled={busy}>
          {busy ? "Syncing…" : "Sync now"}
        </button>
      )}
    </div>
  );
}
