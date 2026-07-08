"use client";

import { useEffect, useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant";
  text: string;
  sql?: string;
  rowCount?: number;
}

const STORAGE_KEY = "healcha-chat";

const GREETING =
  "Hi — I'm your healcha guide. Ask me what any number means or what you should do today, and I'll answer straight from your own data.";

const SUGGESTIONS = [
  "What should I do today?",
  "Why is my readiness low?",
  "How has my sleep been this week?",
  "How can I improve?",
];

/**
 * Inline "Ask healcha" panel over the guarded text-to-SQL pipeline
 * (/api/chat). Local LLM first, cloud fallback — see lib/ai/llm.ts.
 */
export default function ChatCard() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      /* ignore corrupt state */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* quota — fine to drop */
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text?: string) {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: question }]);

    // last 6 completed Q/A pairs as context for follow-ups
    const history: Array<{ question: string; answer: string }> = [];
    for (let i = 0; i < messages.length - 1; i++) {
      if (messages[i].role === "user" && messages[i + 1].role === "assistant") {
        history.push({ question: messages[i].text, answer: messages[i + 1].text });
      }
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: history.slice(-6) }),
      });
      const d: { answer?: string; sql?: string; rowCount?: number; error?: string } =
        await res.json();
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: d.answer ?? d.error ?? "Something went wrong — try again.",
          sql: d.sql,
          rowCount: d.rowCount,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Couldn't reach the server — try again." },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="card flex flex-col overflow-hidden">
      <div
        className="flex items-center justify-between gap-2.5 border-b p-5 pb-3.5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="pulse-dot" style={{ width: 9, height: 9 }} aria-hidden />
          <div>
            <div className="head text-[15px] font-semibold">Ask healcha</div>
            <div className="text-[11.5px]" style={{ color: "var(--faint)" }}>
              Your metrics, explained in plain English
            </div>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            className="btn btn-ghost uppercase"
            onClick={() => setMessages([])}
            disabled={busy}
          >
            Clear
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="hc-scroll flex h-[290px] flex-col gap-3 overflow-y-auto p-5"
        aria-live="polite"
      >
        <Bubble role="assistant">{GREETING}</Bubble>
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role}>
            {m.text}
            {m.sql && (
              <details className="mt-2">
                <summary
                  className="cursor-pointer text-[11px]"
                  style={{ color: "var(--faint)" }}
                >
                  SQL · {m.rowCount ?? 0} rows
                </summary>
                <pre
                  className="mt-1 overflow-x-auto rounded-[8px] p-2 text-[10.5px] leading-snug"
                  style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                >
                  {m.sql}
                </pre>
              </details>
            )}
          </Bubble>
        ))}
        {busy && (
          <div
            className="bubble-in flex items-center gap-1 self-start rounded-[10px] px-3.5 py-3"
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
            aria-label="Looking at your data…"
          >
            <span className="think-dot" />
            <span className="think-dot" style={{ animationDelay: "150ms" }} />
            <span className="think-dot" style={{ animationDelay: "300ms" }} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-[7px] px-5 pb-3.5">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2 px-5 pb-5"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          ref={inputRef}
          className="input min-w-0 flex-1"
          placeholder="Ask about your health…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          aria-label="Ask about your health"
        />
        <button
          type="submit"
          className="btn btn-accent h-[42px] w-[42px] shrink-0 p-0 text-base"
          disabled={busy || !input.trim()}
          aria-label="Send"
        >
          ↑
        </button>
      </form>
    </div>
  );
}

function Bubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
}) {
  const user = role === "user";
  return (
    <div
      className="bubble-in max-w-[86%] whitespace-pre-wrap rounded-[10px] px-[13px] py-2.5 text-[13px] leading-[1.55]"
      style={
        user
          ? {
              alignSelf: "flex-end",
              background: "var(--accent)",
              color: "var(--bg)",
              border: "1px solid var(--accent)",
            }
          : {
              alignSelf: "flex-start",
              background: "var(--bg)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }
      }
    >
      {children}
    </div>
  );
}
