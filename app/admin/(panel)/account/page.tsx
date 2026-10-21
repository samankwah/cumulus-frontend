import { AccountForm } from "@/components/admin/account-form";
import { Badge, PageHeader, RelativeTime } from "@/components/admin/ui";
import { initials } from "@/lib/admin/initials";
import { currentUser } from "@/lib/auth/users";

export default async function AccountPage() {
  const me = await currentUser();
  if (!me) return null;
  return (
    <div className="adm-main-inner narrow" style={{ margin: 0 }}>
      <PageHeader title="My account" description="Your details and password." />
      <section className="adm-card adm-section" style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span className="adm-avatar lg" aria-hidden="true">
          {initials(me.name)}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 16 }}>{me.name}</strong>
            <Badge tone={me.role === "admin" ? "accent" : "neutral"}>{me.role === "admin" ? "Admin" : "Editor"}</Badge>
          </span>
          <span className="adm-muted" style={{ display: "block" }}>
            {me.email}
          </span>
          <span className="adm-muted adm-small">
            Member since <RelativeTime iso={me.createdAt} />
          </span>
        </span>
      </section>
      <AccountForm />
      <p className="adm-hint" style={{ marginTop: 12 }}>
        To change your name or email, ask an admin.
      </p>
    </div>
  );
}
