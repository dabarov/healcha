/**
 * Local model via Ollama (default http://localhost:11434).
 *
 * Default model: qwen3 (8B) with thinking disabled — generates valid SQL
 * for this app's schema in 1-4s and writes fine brief prose. qwen3.5:9b
 * needs thinking mode to produce valid SQL, which takes ~60s per call;
 * gemma3:4b and llama3.1:8b parse but often get the query logic wrong.
 * Override with OLLAMA_MODEL.
 */

const OLLAMA_BASE = () =>
  (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");

const OLLAMA_MODEL = () => process.env.OLLAMA_MODEL || "qwen3";

interface OllamaChatResponse {
  message?: { content?: string; thinking?: string };
  done_reason?: string;
  error?: string;
}

export async function complete(
  system: string,
  user: string,
  maxTokens = 1024,
): Promise<string> {
  const call = (body: Record<string, unknown>) =>
    fetch(`${OLLAMA_BASE()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const base = {
    model: OLLAMA_MODEL(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
    options: { num_predict: maxTokens },
  };
  // Disable thinking — these are latency-sensitive one-shot tasks and
  // thinking tokens count against num_predict.
  let res = await call({ ...base, think: false });
  if (res.status === 400) {
    // Models without thinking support reject the think flag.
    res = await call(base);
  }

  const data = (await res.json()) as OllamaChatResponse;
  if (!res.ok) {
    throw new Error(`Ollama request failed: ${res.status} ${data.error ?? ""}`);
  }
  const text = (data.message?.content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
  if (!text) {
    throw new Error(
      `Ollama returned no text (done_reason: ${data.done_reason ?? "unknown"})`,
    );
  }
  return text;
}
