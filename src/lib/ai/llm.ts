import { complete as anthropicComplete } from "./anthropic";

/**
 * Provider-agnostic one-shot completion for summaries + text-to-SQL.
 *
 * Provider selection (cheapest wins):
 *   - LLM_PROVIDER=gemini|anthropic forces one, else
 *   - GEMINI_API_KEY set → Gemini (free tier on flash models), else Anthropic.
 */

export async function complete(system: string, user: string, maxTokens = 1024): Promise<string> {
  const forced = process.env.LLM_PROVIDER?.toLowerCase();
  const useGemini =
    forced === "gemini" || (forced !== "anthropic" && !!process.env.GEMINI_API_KEY);
  if (useGemini) return geminiComplete(system, user, maxTokens);
  return anthropicComplete(system, user, maxTokens);
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function geminiModel(): string {
  // gemini-2.5-flash: free tier, plenty for daily briefs + SQL generation.
  // gemini-2.5-flash-lite has even higher free rate limits if you hit caps.
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

async function geminiComplete(system: string, user: string, maxTokens: number): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set (or set LLM_PROVIDER=anthropic)");

  const call = (body: Record<string, unknown>) =>
    fetch(`${GEMINI_BASE}/models/${geminiModel()}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });

  const base = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
  };
  // Disable thinking on flash models — these are simple one-shot tasks and
  // thinking tokens count against maxOutputTokens.
  let res = await call({
    ...base,
    generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
  });
  if (res.status === 400) {
    // Some models reject thinkingBudget: 0 — retry without it, with headroom
    // for internal thinking tokens.
    res = await call({ ...base, generationConfig: { maxOutputTokens: maxTokens * 4 } });
  }

  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(`Gemini request failed: ${res.status} ${data.error?.message ?? ""}`);
  }
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request: ${data.promptFeedback.blockReason}`);
  }
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new Error(
      `Gemini returned no text (finishReason: ${data.candidates?.[0]?.finishReason ?? "unknown"})`,
    );
  }
  return text;
}
