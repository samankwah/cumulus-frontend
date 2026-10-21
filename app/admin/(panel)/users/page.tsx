import { redirect } from "next/navigation";

import { UsersManager } from "@/components/admin/users-manager";
import { currentUser, listUsers } from "@/lib/auth/users";

export default async function UsersPage() {
  const me = await currentUser();
  if (me?.role !== "admin") {
    redirect("/admin");
  }
  return <UsersManager initialUsers={await listUsers()} meId={me.id} />;
}
