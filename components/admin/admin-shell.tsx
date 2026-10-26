"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

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
      { href: "/admin/forecast", label: "Official forecast", icon: "cloud" },
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

type ShellUser = { name: string; email: string; role: "admin" | "editor" };

/**
 * The signed-in person, top right of every page: a button with their initials and name that
 * opens a menu with their details, their account page and Sign out (as in GitHub or Vercel).
 */
function AccountMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const role = user.role === "admin" ? "Admin" : "Editor";

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus());
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) return;
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      window.location.assign("/admin/login");
    }
  };

  return (
    <div className="adm-account" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className={`adm-account-button${open ? " open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account: ${user.name}`}
        onClick={() => setOpen((value) => !value)}
        data-testid="admin-account"
      >
        <span className="adm-avatar" aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className="adm-account-text" aria-hidden="true">
          <strong>{user.name}</strong>
          <span>{role}</span>
        </span>
        <svg className="adm-account-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="adm-account-menu" role="menu" id={menuId} aria-label="Account">
          <div className="adm-account-head">
            <span className="adm-avatar lg" aria-hidden="true">
              {initials(user.name)}
            </span>
            <span className="adm-account-who">
              <strong title={user.name}>{user.name}</strong>
              <span title={user.email}>{user.email}</span>
              <span className="adm-account-role">{role}</span>
            </span>
          </div>
          <div className="adm-account-items">
            <Link href="/admin/account" role="menuitem" className="adm-account-item" onClick={() => setOpen(false)}>
              <Icon name="user" size={17} />
              My account
            </Link>
            <a href="/" target="_blank" rel="noreferrer" role="menuitem" className="adm-account-item" onClick={() => setOpen(false)}>
              <Icon name="external" size={17} />
              View the live site
            </a>
          </div>
          <div className="adm-account-items">
            <button type="button" role="menuitem" className="adm-account-item danger" onClick={() => void signOut()} disabled={signingOut}>
              <Icon name="logout" size={17} />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
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

  // "My account" lives in the account menu (top right); only admins manage people.
  const groups = [...NAV, ...(user.role === "admin" ? [{ title: "People", links: [{ href: "/admin/users", label: "Users", icon: "users" as IconName }] }] : [])];
  const current =
    pathname === "/admin/account"
      ? { group: "Account", label: "My account" }
      : groups.flatMap((group) => group.links.map((link) => ({ group: group.title, ...link }))).find((link) => link.href === pathname);

  return (
    <AdminProviders>
      <div className={`adm-shell${navOpen ? " nav-open" : ""}`}>
        <aside className="adm-sidebar" aria-label="Admin navigation" id="admin-nav">
          <Logo />
          <nav>
            {groups.map((group) => (
              <div className={`adm-nav-group${group.title === "People" ? " pinned" : ""}`} key={group.title}>
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
        </aside>
        {navOpen ? <div className="adm-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" /> : null}
        <div className="adm-content">
          <header className="adm-topbar">
            <div className="adm-topbar-start">
              <Button
                className="adm-menu-button"
                variant="ghost"
                icon="menu"
                aria-label="Open menu"
                aria-expanded={navOpen}
                aria-controls="admin-nav"
                onClick={() => setNavOpen(true)}
              />
              <span className="adm-topbar-logo">
                <Logo />
              </span>
              {current ? (
                <nav className="adm-crumbs" aria-label="You are here">
                  <span>{current.group}</span>
                  <Icon name="chevronRight" size={14} />
                  <strong>{current.label}</strong>
                </nav>
              ) : null}
            </div>
            <div className="adm-topbar-end">
              <a className="adm-btn adm-btn-ghost adm-btn-sm adm-live-link" href="/" target="_blank" rel="noreferrer">
                <Icon name="external" size={15} />
                View live site
              </a>
              <span className="adm-topbar-divider" aria-hidden="true" />
              <AccountMenu user={user} />
            </div>
          </header>
          <main className="adm-main" id="main">
            <div className="adm-main-inner">{children}</div>
          </main>
        </div>
      </div>
    </AdminProviders>
  );
}
