import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, readJson, withUser } from "@/lib/auth/api";
import { MIN_PASSWORD_LENGTH, createUser, listUsers } from "@/lib/auth/users";

// Per-user data: never pre-rendered at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async () => NextResponse.json({ users: await listUsers() }), { adminOnly: true });
}

const body = z.object({
  email: z.string().trim().email("Not a valid email").max(200),
  name: z.string().trim().min(1, "Enter a name").max(100),
  password: z.string().min(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters`).max(200),
  role: z.enum(["admin", "editor"]),
});

export async function POST(request: Request) {
  return withUser(
    async () => {
      const parsed = body.safeParse(await readJson(request));
      if (!parsed.success) {
        return jsonError(422, parsed.error.issues[0]?.message ?? "Check the form");
      }
      const user = await createUser(parsed.data);
      if (!user) return jsonError(409, "Someone with that email already has an account");
      return NextResponse.json({ user }, { status: 201 });
    },
    { adminOnly: true },
  );
}
