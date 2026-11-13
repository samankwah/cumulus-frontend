import { safeArtifactPath } from "@/lib/chat/parse-content";
import { getChatConfig } from "@/lib/chat/server/config";
import { chatError, DISABLED_MESSAGE } from "@/lib/chat/server/http";
import { verifyChatToken } from "@/lib/chat/server/token";
import { fetchArtifact } from "@/lib/chat/server/upstream";

/**
 * A file the agent wrote in the visitor's conversation (charts, small data files), fetched with the
 * server's key. Only known, harmless types; images inline, everything else as a download.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;

const TYPES: Record<string, { type: string; inline: boolean }> = {
  png: { type: "image/png", inline: true },
  jpg: { type: "image/jpeg", inline: true },
  jpeg: { type: "image/jpeg", inline: true },
  gif: { type: "image/gif", inline: true },
  webp: { type: "image/webp", inline: true },
  csv: { type: "text/csv; charset=utf-8", inline: false },
  txt: { type: "text/plain; charset=utf-8", inline: false },
  json: { type: "application/json", inline: false },
  geojson: { type: "application/geo+json", inline: false },
  nc: { type: "application/x-netcdf", inline: false },
};

export async function GET(request: Request) {
  const config = getChatConfig();
  if (!config) return chatError("disabled", DISABLED_MESSAGE, 503);
  const url = new URL(request.url);
  const chatId = await verifyChatToken(url.searchParams.get("token"), config.tokenSecret);
  if (!chatId) return chatError("expired", "This conversation has ended.", 401);
  const path = safeArtifactPath(url.searchParams.get("path"));
  const extension = path?.split(".").pop()?.toLowerCase() ?? "";
  const kind = TYPES[extension];
  if (!path || !kind) return chatError("bad_request", "That file can't be shown here.", 400);

  let upstream: Response;
  try {
    upstream = await fetchArtifact(config, chatId, path);
  } catch {
    return chatError("unavailable", "Couldn't fetch the file.", 502);
  }
  if (!upstream.ok || !upstream.body) {
    return chatError(upstream.status === 404 ? "bad_request" : "unavailable", "The file isn't available.", upstream.status === 404 ? 404 : 502);
  }
  const declared = Number(upstream.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) return chatError("bad_request", "The file is too large to show here.", 413);
  const upstreamType = (upstream.headers.get("content-type") ?? "").split(";")[0].trim();
  if (kind.inline && !upstreamType.startsWith("image/")) {
    return chatError("bad_request", "That file can't be shown here.", 415);
  }

  // Count bytes as they pass, so an unannounced huge file is cut off.
  let seen = 0;
  const limited = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > MAX_BYTES) {
          controller.error(new Error("too large"));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );

  const filename = path.split("/").pop()?.replace(/[^\w.-]+/g, "_") || `file.${extension}`;
  return new Response(limited, {
    headers: {
      "Content-Type": kind.type,
      "Content-Disposition": `${kind.inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      ...(declared ? { "Content-Length": String(declared) } : {}),
    },
  });
}
