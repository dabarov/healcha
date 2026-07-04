import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_MODEL } from "@/lib/env";

let _client: Anthropic | undefined;

function client(): Anthropic {
  if (!_client) _client = new Anthropic(); // reads ANTHROPIC_API_KEY
  return _client;
}

/** One-shot text completion on the configured (cheap) model. */
export async function complete(
  system: string,
  user: string,
  maxTokens = 1024,
): Promise<string> {
  const response = await client().messages.create({
    model: ANTHROPIC_MODEL(),
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("Model refused the request");
  }
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
