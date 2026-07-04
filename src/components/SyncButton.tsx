"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton({ lastSync }: { lastSync: string | null }) {
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
      // Refresh the summary for today after new data lands.
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
      <span className="text-xs" style={{ color: "var(--muted)" }} suppressHydrationWarning>
        {error
          ? `Sync failed: ${error.slice(0, 80)}`
          : lastSync
            ? `Last sync ${new Date(lastSync).toLocaleString()}`
            : "Never synced"}
      </span>
      <button
        onClick={sync}
        disabled={busy}
        className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        style={{ background: "var(--c-readiness)", color: "#fff" }}
      >
        {busy ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
