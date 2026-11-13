import { z } from "zod";

import { buildUpstreamQuestion, chatContextSchema } from "@/lib/chat/context";
import { outOfScopePlace, outOfScopeReply } from "@/lib/chat/scope";
import { getChatConfig } from "@/lib/chat/server/config";
import { chatError, DISABLED_MESSAGE, isCrossSite } from "@/lib/chat/server/http";
import { beginRun, takeQuestion, visitorKey } from "@/lib/chat/server/rate-limit";
import { openSocketSession } from "@/lib/chat/server/socket";
import { sseResponse, watchReply } from "@/lib/chat/server/stream";
import { signChatToken, verifyChatToken } from "@/lib/chat/server/token";
import { createChat, getChat, listToolIds, startTurn, UpstreamError } from "@/lib/chat/server/upstream";
import { CHAT_MAX_CHARS } from "@/lib/chat/types";

/**
 * Ask the Weather Skills assistant. Streams the reply as Server-Sent Events.
 * Long skill runs can take minutes; past the budget the stream says "detached" and the browser
 * re-attaches with GET /api/chat/attach (the reply keeps running upstream).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const BUDGET_MS = (maxDuration - 40) * 1000;

const bodySchema = z
  .object({
    token: z.string().max(2000).nullish(),
    message: z.string().trim().min(1).max(CHAT_MAX_CHARS),
    context: chatContextSchema.nullish(),
  })
  .strict();

export async function POST(request: Request) {
  const config = getChatConfig();
  if (!config) return chatError("disabled", DISABLED_MESSAGE, 503);
  if (isCrossSite(request)) return chatError("bad_request", "Cross-site request refused.", 403);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return chatError("bad_request", `Please write a question of up to ${CHAT_MAX_CHARS} characters.`, 400);
  }

  let chatId: string | null = null;
  if (body.token) {
    chatId = await verifyChatToken(body.token, config.tokenSecret);
    if (!chatId) return chatError("expired", "This conversation has ended. Start a new one to keep going.", 401);
  }

  // Clearly about somewhere outside Ghana: answer at once, without the assistant or the visitor's
  // question allowance. The conversation (and its token) carries on untouched.
  const foreignPlace = outOfScopePlace(body.message);
  if (foreignPlace) {
    return sseResponse(async (send) => {
      send({ type: "local", text: outOfScopeReply(foreignPlace) });
    }, request.signal);
  }

  const limit = takeQuestion(visitorKey(request.headers));
  if (!limit.ok) {
    return limit.reason === "busy"
      ? chatError("busy", "The assistant is busy with other questions. Please try again in a minute.", 503, limit.retryAfter)
      : chatError("rate_limited", "You've asked a lot of questions in a short time.", 429, limit.retryAfter);
  }

  const startedAt = Date.now();
  return sseResponse(async (send, signal) => {
    const release = beginRun();
    const session = await openSocketSession(config).catch((error: unknown) => {
      console.error("[chat] socket connect failed", error);
      return null;
    });
    try {
      if (!session) {
        send({ type: "error", code: "unavailable", message: "Couldn't reach the assistant. Please try again in a moment." });
        return;
      }

      const [toolIds, chat] = await Promise.all([
        listToolIds(config),
        chatId ? getChat(config, chatId) : createChat(config),
      ]);
      const history = chat.chat?.history;
      const parentId = history?.currentId ?? null;
      const previous = parentId ? history?.messages[parentId] : undefined;
      if (previous?.role === "assistant" && !previous.done && !previous.error) {
        send({ type: "error", code: "busy", message: "Still working on your last question. Wait for it to finish or stop it first." });
        return;
      }

      const firstTurn = !parentId;
      const turn = await startTurn(config, {
        chatId: chat.id,
        revision: chat.meta?.revision ?? 0,
        parentId,
        content: buildUpstreamQuestion(body.message, body.context ?? undefined, firstTurn),
        sessionId: session.sessionId,
        toolIds,
        generateTitle: firstTurn,
      });

      const token = chatId && body.token ? body.token : await signChatToken(chat.id, config.tokenSecret);
      send({ type: "start", token, userId: turn.userId, assistantId: turn.assistantId });

      await watchReply({
        config,
        session,
        chatId: chat.id,
        assistantId: turn.assistantId,
        send,
        signal,
        deadline: startedAt + BUDGET_MS,
      });
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 404) {
        send({ type: "error", code: "expired", message: "This conversation is no longer available. Start a new one to keep going." });
      } else if (error instanceof UpstreamError && error.status === 409) {
        send({ type: "error", code: "busy", message: "The conversation changed while sending. Please send your question again." });
      } else {
        console.error("[chat] ask failed", error);
        send({ type: "error", code: "unavailable", message: "Couldn't reach the assistant. Please try again in a moment." });
      }
    } finally {
      session?.close();
      release();
    }
  }, request.signal);
}
