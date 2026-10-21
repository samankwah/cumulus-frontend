import { SignJWT, jwtVerify } from "jose";

/* ------------------------------------------------------------------------------------------
 * Admin sessions: a signed cookie holding the user's id, role and session version. Kept free of
 * database and Node-only code so middleware.ts (Edge runtime) can check it on every request; the
 * API routes then re-check the user against the database (still active, same session version).
 * ------------------------------------------------------------------------------------------ */

export const SESSION_COOKIE = "cumulus_admin";
export const SESSION_HOURS = 12;

export type SessionClaims = { uid: number; role: "admin" | "editor"; sv: number };

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return null;
  }
  return new TextEncoder().encode(secret);
}

export function hasSessionSecret() {
  return secretKey() !== null;
}

export async function signSession(claims: SessionClaims) {
  const key = secretKey();
  if (!key) {
    throw new Error("SESSION_SECRET is not set (32+ characters)");
  }
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key);
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  const key = secretKey();
  if (!token || !key) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const { uid, role, sv } = payload as Partial<SessionClaims>;
    if (typeof uid !== "number" || (role !== "admin" && role !== "editor") || typeof sv !== "number") {
      return null;
    }
    return { uid, role, sv };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  };
}
