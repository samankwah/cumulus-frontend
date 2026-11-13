import { io, type Socket } from "socket.io-client";

import type { ChatConfig } from "./config";

/**
 * Weather Skills reports a reply's progress over socket.io (`chat-events`), the same way its own
 * web app does. The socket joins the account's room, so it also hears the account's other chats:
 * listeners filter by chat and message id.
 */

export type ChatEvent = {
  chat_id?: string;
  message_id?: string;
  data?: { type?: string; data?: Record<string, unknown> | null };
};

export type SocketSession = {
  sessionId: string;
  onEvent: (listener: (event: ChatEvent) => void) => () => void;
  close: () => void;
};

export async function openSocketSession(config: ChatConfig, timeoutMs = 12_000): Promise<SocketSession> {
  const socket: Socket = io(config.baseUrl, {
    path: "/ws/socket.io",
    transports: ["websocket"],
    auth: { token: config.apiKey },
    reconnection: false,
    timeout: timeoutMs,
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("socket connect timeout"));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (error: Error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
  });

  socket.emit("user-join", { auth: { token: config.apiKey } });

  const listeners = new Set<(event: ChatEvent) => void>();
  socket.on("chat-events", (event: ChatEvent) => {
    for (const listener of listeners) listener(event);
  });

  return {
    sessionId: socket.id ?? "",
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
      socket.removeAllListeners();
      socket.close();
    },
  };
}
