import { randomUUID } from "node:crypto";

import type { ChatConfig } from "./config";

/**
 * REST calls to Weather Skills (an Open WebUI fork). A reply is produced by a background task that
 * reports over socket.io (see ./socket.ts); these calls create chats, start turns, read the stored
 * chat, stop a task and fetch files the agent wrote.
 */

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

/** The workspace header the Weather Skills web app sends on every request. */
function orgHeader(config: ChatConfig): Record<string, string> {
  return config.organizationId ? { "X-Organization-Id": config.organizationId } : {};
}

async function call<T>(config: ChatConfig, path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 20_000, ...rest } = init;
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...rest,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
      ...orgHeader(config),
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    // Upstream text is logged, never shown to visitors.
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    console.error(`[chat] upstream ${init.method ?? "GET"} ${path.split("?")[0]} -> ${response.status} ${detail}`);
    throw new UpstreamError(`Weather Skills answered ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

export type UpstreamMessage = {
  id: string;
  parentId: string | null;
  childrenIds?: string[];
  role: "user" | "assistant";
  content: string;
  done?: boolean;
  error?: { content?: string } | null;
  timestamp?: number;
};

export type UpstreamChat = {
  id: string;
  title: string;
  meta?: { revision?: number };
  chat: {
    history: { messages: Record<string, UpstreamMessage>; currentId: string | null };
  };
};

let toolCache: { ids: string[]; at: number } | null = null;
const TOOL_TTL_MS = 10 * 60 * 1000;

/** Every installed skill. Without tool_ids the agent says its skills are switched off. */
export async function listToolIds(config: ChatConfig): Promise<string[]> {
  if (toolCache && Date.now() - toolCache.at < TOOL_TTL_MS) {
    return toolCache.ids;
  }
  const tools = await call<Array<{ id: string }>>(config, "/api/v1/tools/");
  const ids = tools.map((tool) => tool.id).filter((id) => typeof id === "string" && id.length > 0);
  toolCache = { ids, at: Date.now() };
  return ids;
}

export async function createChat(config: ChatConfig): Promise<UpstreamChat> {
  return call<UpstreamChat>(config, "/api/v1/chats/new", {
    method: "POST",
    body: JSON.stringify({
      chat: {
        id: "",
        title: "Cumulus visitor",
        models: [config.model],
        params: {},
        history: { messages: {}, currentId: null },
        messages: [],
        tags: [],
        timestamp: Date.now(),
      },
      ...(config.organizationId ? { organization_id: config.organizationId } : {}),
    }),
  });
}

export async function getChat(config: ChatConfig, chatId: string): Promise<UpstreamChat> {
  return call<UpstreamChat>(config, `/api/v1/chats/${chatId}`);
}

/** Starts one turn; the reply arrives on the socket session `sessionId`. Returns the task id. */
export async function startTurn(
  config: ChatConfig,
  options: {
    chatId: string;
    revision: number;
    parentId: string | null;
    content: string;
    sessionId: string;
    toolIds: string[];
    generateTitle: boolean;
  },
): Promise<{ taskId: string | null; userId: string; assistantId: string }> {
  const userId = randomUUID();
  const assistantId = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const body = {
    stream: true,
    model: config.model,
    turn: {
      parent_id: options.parentId,
      expected_revision: options.revision,
      user_message: {
        id: userId,
        parentId: options.parentId,
        childrenIds: [assistantId],
        role: "user",
        content: options.content,
        timestamp: now,
        models: [config.model],
      },
      assistant_message: {
        id: assistantId,
        parentId: userId,
        childrenIds: [],
        role: "assistant",
        content: "",
        done: false,
        model: config.model,
        modelName: "Weather Agent",
        modelIdx: 0,
        timestamp: now,
      },
    },
    tool_ids: options.toolIds,
    features: { image_generation: false, code_interpreter: false, web_search: false },
    session_id: options.sessionId,
    chat_id: options.chatId,
    id: assistantId,
    ...(options.generateTitle ? { background_tasks: { title_generation: true } } : {}),
  };
  const result = await call<{ status?: boolean; task_id?: string; error?: unknown }>(config, "/api/chat/completions", {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: 30_000,
  });
  if (result?.error) {
    console.error("[chat] turn refused", JSON.stringify(result.error).slice(0, 300));
    throw new UpstreamError("Weather Skills refused the turn", 502);
  }
  return { taskId: result?.task_id ?? null, userId, assistantId };
}

/** Task ids still running for a chat. */
export async function listChatTasks(config: ChatConfig, chatId: string): Promise<string[]> {
  const result = await call<{ task_ids?: string[] }>(config, `/api/tasks/chat/${chatId}`).catch(() => null);
  return Array.isArray(result?.task_ids) ? result.task_ids : [];
}

export async function stopTask(config: ChatConfig, taskId: string): Promise<void> {
  await call(config, `/api/tasks/stop/${taskId}`, { method: "POST" });
}

/** A file from the chat's workspace (plots, CSVs). Streams the body; the caller checks type and size. */
export async function fetchArtifact(config: ChatConfig, chatId: string, path: string): Promise<Response> {
  return fetch(`${config.baseUrl}/api/v1/chats/${chatId}/artifacts/content?path=${encodeURIComponent(path)}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${config.apiKey}`, ...orgHeader(config) },
    signal: AbortSignal.timeout(30_000),
  });
}
