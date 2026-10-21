"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Icon } from "@/components/admin/icons";
import type { IconName } from "@/components/admin/icons";
import { AdminProviders, Button } from "@/components/admin/ui";
import { initials } from "@/lib/admin/initials";

type NavLink = { href: string; label: string; icon: IconName };

const NAV: { title: string; links: NavLink[] }[] = [
  {
    title: "Site",
    links: [
      { href: "/admin", label: "Overview", icon: "home" },
      { href: "/admin/announcements", label: "Announcements", icon: "megaphone" },
      { href: "/admin/site", label: "Site text", icon: "text" },
    ],
  },
  {
    title: "Farm advisory",
    links: [
      { href: "/admin/messages", label: "Advisory messages", icon: "message" },
      { href: "/admin/crops", label: "Crops", icon: "sprout" },
      { href: "/admin/thresholds", label: "Thresholds", icon: "gauge" },
      { href: "/admin/seasons", label: "Season calendar", icon: "calendar" },
      { href: "/admin/regions", label: "Regions & sectors", icon: "map" },
      { href: "/admin/labels", label: "Advisory labels", icon: "tag" },
    ],
  },
];

export function Logo() {
  return (
    <Link href="/admin" className="adm-logo">
      <span className="adm-logo-mark">
        <Icon name="cloud" size={18} />
      </span>
      <span className="adm-logo-text">
        <strong>Cumulus</strong>
        <span>Content admin</span>
      </span>
    </Link>
  );
}

export function AdminShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: "admin" | "editor" };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  // Close the phone menu after moving to another page.
  useEffect(() => setNavOpen(false), [pathname]);

  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  const groups = [
    ...NAV,
    {
      title: "People",
      links: [
        ...(user.role === "admin" ? [{ href: "/admin/users", label: "Users", icon: "users" as IconName }] : []),
        { href: "/admin/account", label: "My account", icon: "user" as IconName },
      ],
    },
  ];

  return (
    <AdminProviders>
      <div className={`adm-shell${navOpen ? " nav-open" : ""}`}>
        <aside className="adm-sidebar" aria-label="Admin navigation" id="admin-nav">
          <Logo />
          <nav>
            {groups.map((group) => (
              <div className="adm-nav-group" key={group.title}>
                <h3>{group.title}</h3>
                {group.links.map((link) => {
                  const active = pathname === link.href;
                  return (
                    <Link key={link.href} href={link.href} className={`adm-nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                      <Icon name={link.icon} size={18} />
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="adm-sidebar-foot">
            <a className="adm-nav-link" href="/" target="_blank" rel="noreferrer">
              <Icon name="external" size={18} />
              View the live site
            </a>
            <div className="adm-me">
              <span className="adm-avatar" aria-hidden="true">
                {initials(user.name)}
              </span>
              <span className="adm-me-text">
                <strong title={user.email}>{user.name}</strong>
                <span>{user.role === "admin" ? "Admin" : "Editor"}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon="logout"
                aria-label="Sign out"
                title="Sign out"
                onClick={async () => {
                  await fetch("/api/admin/logout", { method: "POST" });
                  window.location.assign("/admin/login");
                }}
              />
            </div>
          </div>
        </aside>
        {navOpen ? <div className="adm-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" /> : null}
        <div className="adm-content">
          <header className="adm-topbar">
            <Button
              variant="ghost"
              icon="menu"
              aria-label="Open menu"
              aria-expanded={navOpen}
              aria-controls="admin-nav"
              onClick={() => setNavOpen(true)}
            />
            <Logo />
          </header>
          <main className="adm-main" id="main">
            <div className="adm-main-inner">{children}</div>
          </main>
        </div>
      </div>
    </AdminProviders>
  );
}
