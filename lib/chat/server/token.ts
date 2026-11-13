import { SignJWT, jwtVerify } from "jose";

/**
 * A visitor's conversation is a chat in the Weather Skills account. The browser only ever holds a
 * signed token naming that chat, so nobody can read or continue a chat they did not start.
 */

const ISSUER = "cumulus-chat";
const TTL_SECONDS = 60 * 60 * 24; // one day

const encoder = new TextEncoder();

export async function signChatToken(chatId: string, secret: string): Promise<string> {
  return new SignJWT({ c: chatId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(encoder.encode(secret));
}

/** The chat id, or null when the token is missing, forged or expired. */
export async function verifyChatToken(token: string | null | undefined, secret: string): Promise<string | null> {
  if (!token || token.length > 2000) return null;
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret), { issuer: ISSUER, algorithms: ["HS256"] });
    const chatId = payload.c;
    return typeof chatId === "string" && /^[0-9a-f-]{36}$/i.test(chatId) ? chatId : null;
  } catch {
    return null;
  }
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
