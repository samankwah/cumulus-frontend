import { NextResponse } from "next/server";
import { z } from "zod";

import { getChatConfig } from "@/lib/chat/server/config";
import { chatError, DISABLED_MESSAGE, isCrossSite } from "@/lib/chat/server/http";
import { verifyChatToken } from "@/lib/chat/server/token";
import { listChatTasks, stopTask } from "@/lib/chat/server/upstream";

/** Stops the reply being worked on in the visitor's conversation (frees the shared account). */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ token: z.string().max(2000) }).strict();

export async function POST(request: Request) {
  const config = getChatConfig();
  if (!config) return chatError("disabled", DISABLED_MESSAGE, 503);
  if (isCrossSite(request)) return chatError("bad_request", "Cross-site request refused.", 403);
  let token: string;
  try {
    token = bodySchema.parse(await request.json()).token;
  } catch {
    return chatError("bad_request", "Bad request.", 400);
  }
  const chatId = await verifyChatToken(token, config.tokenSecret);
  if (!chatId) return chatError("expired", "This conversation has ended.", 401);

  // Only tasks the upstream lists for this chat can be stopped, so a token can't stop others' work.
  const tasks = await listChatTasks(config, chatId);
  const results = await Promise.allSettled(tasks.map((taskId) => stopTask(config, taskId)));
  return NextResponse.json(
    { stopped: results.filter((result) => result.status === "fulfilled").length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
