import { Logo } from "@/components/admin/admin-shell";
import { LoginForm } from "@/components/admin/login-form";
import { NotConfigured } from "@/components/admin/not-configured";
import { hasSessionSecret } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db/client";

export const metadata = { title: "Sign in · Cumulus admin" };

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  if (!hasDatabase() || !hasSessionSecret()) {
    return <NotConfigured hasDatabase={hasDatabase()} hasSecret={hasSessionSecret()} />;
  }
  // Only same-site admin paths, so the login page cannot be used to bounce people elsewhere.
  const next = searchParams.next?.startsWith("/admin") && !searchParams.next.startsWith("//") ? searchParams.next : "/admin";
  return (
    <div className="adm-auth">
      <div className="adm-card adm-auth-card">
        <Logo />
        <h1>Sign in</h1>
        <p className="adm-muted" style={{ margin: "6px 0 22px" }}>
          Edit the forecast site&apos;s advisories, announcements and text.
        </p>
        <LoginForm next={next} />
        <p className="adm-auth-foot">Forgot your password? Ask an admin to set a new one for you.</p>
      </div>
    </div>
  );
}
