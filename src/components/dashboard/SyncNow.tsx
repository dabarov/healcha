"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Header sync trigger: runs /api/sync then refreshes the server payload. */
export default function SyncNow() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      fetch("/api/summary?refresh=1").catch(() => {});
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error && (
        <span className="hidden max-w-[220px] truncate text-xs sm:block" style={{ color: "var(--bad)" }}>
          Sync failed: {error}
        </span>
      )}
      <button className="btn btn-accent" onClick={sync} disabled={busy}>
        {busy ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
