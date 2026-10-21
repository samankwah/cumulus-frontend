import { Icon } from "@/components/admin/icons";

/** Shown on the admin pages until the database and session secret are set up (see docs/admin-cms.md). */
export function NotConfigured({ hasDatabase, hasSecret }: { hasDatabase: boolean; hasSecret: boolean }) {
  const items = [
    { ok: hasDatabase, name: "DATABASE_URL", about: "the Neon Postgres connection string (Vercel → Storage → Neon)" },
    { ok: hasSecret, name: "SESSION_SECRET", about: "a random string of 32 or more characters, for sign-in cookies" },
  ];
  return (
    <div className="adm-auth">
      <div className="adm-card adm-auth-card" style={{ width: "min(560px, 100%)" }}>
        <span className="adm-empty-icon" style={{ marginBottom: 14 }}>
          <Icon name="key" size={22} />
        </span>
        <h1>The admin area isn&apos;t set up yet</h1>
        <p className="adm-muted" style={{ margin: "8px 0 18px" }}>
          The public site is running normally on its built-in content. To turn on editing, add these settings:
        </p>
        <ul className="adm-checklist">
          {items.map((item) => (
            <li key={item.name}>
              <span className={item.ok ? "adm-check-ok" : "adm-check-no"}>
                <Icon name={item.ok ? "check" : "close"} size={17} />
              </span>
              <span>
                <code>{item.name}</code> {item.ok ? <span className="adm-muted">is set</span> : <span className="adm-muted">— {item.about}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="adm-auth-foot" style={{ textAlign: "left" }}>
          Then run <code>npm run db:migrate</code> and <code>npm run admin:create</code>. Step-by-step instructions are in{" "}
          <code>docs/admin-cms.md</code>.
        </p>
      </div>
    </div>
  );
}
