import { getChatConfig } from "@/lib/chat/server/config";
import { chatError, DISABLED_MESSAGE } from "@/lib/chat/server/http";
import { beginRun } from "@/lib/chat/server/rate-limit";
import { openSocketSession } from "@/lib/chat/server/socket";
import { snapshotFromStored, sseResponse, watchReply } from "@/lib/chat/server/stream";
import { UUID_PATTERN, verifyChatToken } from "@/lib/chat/server/token";
import { getChat, UpstreamError } from "@/lib/chat/server/upstream";

/**
 * Re-attach to a reply that is still being worked on: after the ask stream's time budget, a
 * dropped connection, or a page reload. Sends the stored state first, then live progress.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const BUDGET_MS = (maxDuration - 40) * 1000;

export async function GET(request: Request) {
  const config = getChatConfig();
  if (!config) return chatError("disabled", DISABLED_MESSAGE, 503);
  const url = new URL(request.url);
  const chatId = await verifyChatToken(url.searchParams.get("token"), config.tokenSecret);
  if (!chatId) return chatError("expired", "This conversation has ended.", 401);
  const messageId = url.searchParams.get("message") ?? "";
  if (!UUID_PATTERN.test(messageId)) return chatError("bad_request", "Unknown message.", 400);

  const startedAt = Date.now();
  return sseResponse(async (send, signal) => {
    let chat;
    try {
      chat = await getChat(config, chatId);
    } catch (error) {
      const gone = error instanceof UpstreamError && error.status === 404;
      send({
        type: "error",
        code: gone ? "expired" : "unavailable",
        message: gone ? "This conversation is no longer available." : "Couldn't reach the assistant. Please try again in a moment.",
      });
      return;
    }
    const message = chat.chat.history.messages[messageId];
    if (!message || message.role !== "assistant") {
      send({ type: "error", code: "bad_request", message: "Unknown message." });
      return;
    }
    const stored = snapshotFromStored(messageId, message.content, Boolean(message.done || message.error), message.error);
    if (stored.done) {
      send({ type: "snapshot", message: stored });
      return;
    }

    const release = beginRun();
    const session = await openSocketSession(config).catch(() => null);
    try {
      if (!session) {
        send({ type: "snapshot", message: stored });
        send({ type: "detached" });
        return;
      }
      await watchReply({
        config,
        session,
        chatId,
        assistantId: messageId,
        send,
        signal,
        deadline: startedAt + BUDGET_MS,
        initial: { ...stored, status: stored.parts.length ? "Still working…" : "Thinking…" },
      });
    } finally {
      session?.close();
      release();
    }
  }, request.signal);
}
