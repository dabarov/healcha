"use client";

import { useEffect, useState } from "react";

/** The AI-generated daily summary (same generator as the Telegram brief). */
export default function TodayPanel() {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/summary")
      .then((r) => r.json())
      .then((d: { text?: string }) => setText(d.text ?? null))
      .catch(() => setError(true));
  }, []);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Today</h2>
        <button
          className="text-xs"
          style={{ color: "var(--muted)" }}
          onClick={() => {
            setText(null);
            fetch("/api/summary?refresh=1")
              .then((r) => r.json())
              .then((d: { text?: string }) => setText(d.text ?? null))
              .catch(() => setError(true));
          }}
        >
          ↻ regenerate
        </button>
      </div>
      {error ? (
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          Couldn&apos;t load the summary.
        </p>
      ) : text == null ? (
        <p className="text-sm animate-pulse" style={{ color: "var(--muted)" }}>
          Writing your summary…
        </p>
      ) : (
        <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {text}
        </p>
      )}
    </div>
  );
}
