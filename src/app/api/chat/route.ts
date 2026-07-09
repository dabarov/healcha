import { NextRequest, NextResponse } from "next/server";
import { askHealthQuestion, type ChatTurn } from "@/lib/ai/textToSql";

export const dynamic = "force-dynamic";

/**
 * Dashboard chat: free-text health questions answered by the same guarded
 * text-to-SQL pipeline as the ask CLI.
 */
export async function POST(req: NextRequest) {
  let body: { question?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 2000) {
    return NextResponse.json(
      { error: "question must be a non-empty string (max 2000 chars)" },
      { status: 400 },
    );
  }

  const history: ChatTurn[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (t): t is ChatTurn =>
            t != null &&
            typeof (t as ChatTurn).question === "string" &&
            typeof (t as ChatTurn).answer === "string",
        )
        .slice(-6)
    : [];

  const result = await askHealthQuestion(question, history);
  return NextResponse.json(result);
}
