"use client";

import { useEffect, useState } from "react";
import { fmtDayLong } from "@/lib/view";

// Module-level cache: re-visiting a day never refetches its brief.
const cache = new Map<string, string>();

/**
 * The AI daily brief, generated on demand and cached per date server-side.
 * Follows the selected calendar day.
 */
export default function BriefCard({ date, today }: { date: string; today: string }) {
  const [text, setText] = useState<string | null>(cache.get(date) ?? null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setText(cache.get(date) ?? null);
    setError(false);
    if (cache.has(date)) return;
    let cancelled = false;
    fetch(`/api/summary?date=${date}`)
      .then((r) => r.json())
      .then((d: { text?: string }) => {
        if (cancelled) return;
        if (d.text) {
          cache.set(date, d.text);
          setText(d.text);
        } else setError(true);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [date]);

  async function regenerate() {
    setRefreshing(true);
    setText(null);
    setError(false);
    try {
      const r = await fetch(`/api/summary?date=${date}&refresh=1`);
      const d: { text?: string } = await r.json();
      if (d.text) {
        cache.set(date, d.text);
        setText(d.text);
      } else setError(true);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }

  const isToday = date === today;

  return (
    <div
      className="rounded-[14px] p-5"
      style={{ background: "var(--brief-bg)", border: "1px solid var(--brief-border)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="pulse-dot" aria-hidden />
          <span className="head text-[15px] font-semibold uppercase tracking-[0.06em]">
            {isToday ? "Today's brief" : `Brief · ${fmtDayLong(date)}`}
          </span>
        </div>
        <button className="btn btn-ghost uppercase" onClick={regenerate} disabled={refreshing || text == null && !error}>
          Regenerate
        </button>
      </div>
      {error ? (
        <p className="m-0 text-sm" style={{ color: "var(--bad)" }}>
          Couldn&apos;t write the brief — check the LLM provider and try again.
        </p>
      ) : text == null ? (
        <div className="flex max-w-[760px] flex-col gap-2.5 py-1" aria-label="Writing your brief…">
          <div className="skeleton h-3.5 w-[92%]" />
          <div className="skeleton h-3.5 w-full" style={{ animationDelay: "120ms" }} />
          <div className="skeleton h-3.5 w-[64%]" style={{ animationDelay: "240ms" }} />
        </div>
      ) : (
        <p
          key={`${date}-${text.slice(0, 24)}`}
          className="fade-in m-0 max-w-[760px] whitespace-pre-wrap text-[15px] leading-[1.6]"
        >
          {text}
        </p>
      )}
    </div>
  );
}
