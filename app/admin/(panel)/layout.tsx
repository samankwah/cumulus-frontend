import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { NotConfigured } from "@/components/admin/not-configured";
import { hasSessionSecret } from "@/lib/auth/session";
import { currentUser } from "@/lib/auth/users";
import { hasDatabase } from "@/lib/db/client";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!hasDatabase() || !hasSessionSecret()) {
    return <NotConfigured hasDatabase={hasDatabase()} hasSecret={hasSessionSecret()} />;
  }
  const user = await currentUser();
  if (!user) {
    redirect("/admin/login");
  }
  return <AdminShell user={{ name: user.name, email: user.email, role: user.role }}>{children}</AdminShell>;
}
