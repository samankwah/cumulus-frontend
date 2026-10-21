import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, readJson, withUser } from "@/lib/auth/api";
import { MIN_PASSWORD_LENGTH, countActiveAdmins, deleteUser, listUsers, updateUser } from "@/lib/auth/users";

type Params = { params: { id: string } };

const body = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["admin", "editor"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters`).max(200).optional(),
});

/** Refuses a change that would leave nobody able to manage users. */
async function wouldRemoveLastAdmin(id: number, change: { role?: string; active?: boolean; deleting?: boolean }) {
  const target = (await listUsers()).find((user) => user.id === id);
  if (!target || target.role !== "admin" || !target.active) return false;
  const losesAdmin = change.deleting || change.active === false || (change.role !== undefined && change.role !== "admin");
  return losesAdmin && (await countActiveAdmins()) <= 1;
}

export async function PATCH(request: Request, { params }: Params) {
  return withUser(
    async () => {
      const id = Number(params.id);
      const parsed = body.safeParse(await readJson(request));
      if (!Number.isInteger(id) || !parsed.success) {
        return jsonError(422, parsed.success ? "Unknown user" : (parsed.error.issues[0]?.message ?? "Check the form"));
      }
      if (await wouldRemoveLastAdmin(id, parsed.data)) {
        return jsonError(409, "Keep at least one active admin");
      }
      const user = await updateUser(id, parsed.data);
      return user ? NextResponse.json({ user }) : jsonError(404, "Unknown user");
    },
    { adminOnly: true },
  );
}

export async function DELETE(_request: Request, { params }: Params) {
  return withUser(
    async (me) => {
      const id = Number(params.id);
      if (!Number.isInteger(id)) return jsonError(404, "Unknown user");
      if (id === me.id) return jsonError(409, "You cannot delete your own account");
      if (await wouldRemoveLastAdmin(id, { deleting: true })) return jsonError(409, "Keep at least one active admin");
      return (await deleteUser(id)) ? NextResponse.json({ ok: true }) : jsonError(404, "Unknown user");
    },
    { adminOnly: true },
  );
}
