"use client";

import { useState } from "react";

import { RadioCards, TextInput } from "@/components/admin/fields";
import { Icon } from "@/components/admin/icons";
import { Badge, Button, CopyButton, Dialog, Menu, RelativeTime, useConfirm, useToast } from "@/components/admin/ui";
import { initials } from "@/lib/admin/initials";
import type { AdminUser } from "@/lib/auth/users";

type Role = "admin" | "editor";

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "editor", label: "Editor", description: "Can change all content: announcements, advisories, crops, thresholds and text." },
  { value: "admin", label: "Admin", description: "Everything an editor can do, plus adding people, changing roles and resetting passwords." },
];

/** A readable random password: no 0/O or 1/l to mix up when read out. */
function generatePassword() {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(14)), (byte) => alphabet[byte % alphabet.length]).join("");
}

async function call(url: string, method: string, body?: unknown) {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; user?: AdminUser };
    return { ok: response.ok, ...data };
  } catch {
    return { ok: false, error: "No connection. Check your internet and try again." } as { ok: boolean; error?: string; user?: AdminUser };
  }
}

type Credentials = { title: string; name: string; email: string; password: string };

export function UsersManager({ initialUsers, meId }: { initialUsers: AdminUser[]; meId: number }) {
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  const replace = (user: AdminUser) => setUsers((list) => list.map((item) => (item.id === user.id ? user : item)));

  const patch = async (user: AdminUser, change: Partial<{ role: Role; active: boolean; password: string }>) => {
    setError(null);
    const result = await call(`/api/admin/users/${user.id}`, "PATCH", change);
    if (result.ok && result.user) {
      replace(result.user);
      return result.user;
    }
    setError(result.error ?? "Could not update this person");
    return null;
  };

  const active = users.filter((user) => user.active).length;

  return (
    <>
      <div className="adm-page-head">
        <div className="adm-page-titles">
          <h1>Users</h1>
          <p className="adm-page-desc">
            Who can sign in to this admin area. Give each person their own account, so History shows who changed what.
          </p>
        </div>
        <div className="adm-page-actions">
          <Button variant="primary" icon="plus" onClick={() => setInviteOpen(true)}>
            Add person
          </Button>
        </div>
      </div>

      {error ? (
        <div className="adm-banner tone-danger" role="alert">
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="adm-card">
        <header className="adm-item-head">
          <h2>
            People <span className="adm-muted adm-small">{active} active</span>
          </h2>
        </header>
        <ul className="adm-list">
          {users.map((user) => {
            const isMe = user.id === meId;
            return (
              <li key={user.id} style={{ opacity: user.active ? 1 : 0.65 }}>
                <span className="adm-avatar" aria-hidden="true">
                  {initials(user.name)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong>{user.name}</strong>
                    {isMe ? <Badge>You</Badge> : null}
                    <Badge tone={user.role === "admin" ? "accent" : "neutral"}>{user.role === "admin" ? "Admin" : "Editor"}</Badge>
                    {!user.active ? <Badge tone="warning">Switched off</Badge> : null}
                  </span>
                  <span className="adm-muted adm-small" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={user.email}>
                    {user.email}
                  </span>
                  <span className="adm-muted adm-small" style={{ display: "block" }}>
                    {user.lastLoginAt ? (
                      <>
                        Last signed in <RelativeTime iso={user.lastLoginAt} />
                      </>
                    ) : (
                      "Never signed in"
                    )}
                  </span>
                </span>
                <Menu
                  label={`Actions for ${user.name}`}
                  items={[
                    {
                      label: user.role === "admin" ? "Make editor" : "Make admin",
                      icon: "users",
                      onSelect: async () => {
                        const next: Role = user.role === "admin" ? "editor" : "admin";
                        if (
                          await confirm({
                            title: `Make ${user.name} ${next === "admin" ? "an admin" : "an editor"}?`,
                            description:
                              next === "admin"
                                ? "They will be able to add people, change roles and reset passwords."
                                : "They keep editing content but can no longer manage people. They are signed out and need to sign in again.",
                            confirmLabel: next === "admin" ? "Make admin" : "Make editor",
                          })
                        ) {
                          if (await patch(user, { role: next })) {
                            // A role change signs that person out, so after changing your own, sign in again.
                            if (isMe) window.location.assign("/admin/login");
                            else toast(`${user.name} is now ${next === "admin" ? "an admin" : "an editor"}`);
                          }
                        }
                      },
                    },
                    {
                      label: "Set a new password",
                      icon: "key",
                      onSelect: async () => {
                        if (
                          await confirm({
                            title: `Set a new password for ${user.name}?`,
                            description: "Their current password stops working and they are signed out everywhere. You'll see the new one next.",
                            confirmLabel: "Set new password",
                          })
                        ) {
                          const password = generatePassword();
                          if (await patch(user, { password })) {
                            setCredentials({ title: "New password set", name: user.name, email: user.email, password });
                          }
                        }
                      },
                    },
                    ...(isMe
                      ? []
                      : [
                          {
                            label: user.active ? "Switch off" : "Switch on",
                            icon: (user.active ? "eyeOff" : "eye") as "eyeOff" | "eye",
                            onSelect: async () => {
                              if (user.active) {
                                const ok = await confirm({
                                  title: `Switch off ${user.name}?`,
                                  description: "They are signed out and can't sign in until switched on again. Their changes stay in History.",
                                  confirmLabel: "Switch off",
                                  tone: "danger",
                                });
                                if (!ok) return;
                              }
                              if (await patch(user, { active: !user.active })) {
                                toast(user.active ? `${user.name} switched off` : `${user.name} switched on`);
                              }
                            },
                          },
                          {
                            label: "Delete account",
                            icon: "trash" as const,
                            tone: "danger" as const,
                            onSelect: async () => {
                              const ok = await confirm({
                                title: `Delete ${user.name}'s account?`,
                                description: (
                                  <>
                                    This can&apos;t be undone. Their name stays in History. To stop someone signing in for now, <strong>Switch off</strong>{" "}
                                    instead.
                                  </>
                                ),
                                confirmLabel: "Delete account",
                                tone: "danger",
                              });
                              if (!ok) return;
                              const result = await call(`/api/admin/users/${user.id}`, "DELETE");
                              if (result.ok) {
                                setUsers((list) => list.filter((item) => item.id !== user.id));
                                toast(`${user.name}'s account deleted`);
                              } else {
                                setError(result.error ?? "Could not delete this account");
                              }
                            },
                          },
                        ]),
                  ]}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCreated={(user, password) => {
          setUsers((list) => [...list, user]);
          setInviteOpen(false);
          setCredentials({ title: "Account created", name: user.name, email: user.email, password });
        }}
      />

      <Dialog
        open={Boolean(credentials)}
        onClose={() => setCredentials(null)}
        title={credentials?.title ?? ""}
        description={
          <>
            Give these details to {credentials?.name} in person or by phone. <strong>The password is only shown now.</strong> They can change it
            under My account after signing in.
          </>
        }
        footer={
          <Button variant="primary" onClick={() => setCredentials(null)}>
            Done
          </Button>
        }
      >
        {credentials ? (
          <div className="adm-stack" style={{ gap: 12 }}>
            <CredentialRow label="Sign-in page" value={`${window.location.origin}/admin/login`} />
            <CredentialRow label="Email" value={credentials.email} />
            <CredentialRow label="Password" value={credentials.password} mono />
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

function CredentialRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="adm-field">
      <span className="adm-label">{label}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <code style={{ flex: 1, padding: "8px 10px", fontSize: mono ? 15 : 13.5, letterSpacing: mono ? "0.04em" : undefined, overflowWrap: "anywhere" }}>
          {value}
        </code>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

function InviteDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (user: AdminUser, password: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setEmail("");
    setRole("editor");
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add a person"
      description="They get a password to sign in with, which you hand over yourself."
      footer={
        <>
          <Button
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!name.trim() || !email.trim()) {
                setError("Enter their name and email");
                return;
              }
              setBusy(true);
              const password = generatePassword();
              const result = await call("/api/admin/users", "POST", { name, email, role, password });
              setBusy(false);
              if (result.ok && result.user) {
                onCreated(result.user, password);
                reset();
              } else {
                setError(result.error ?? "Could not add this person");
              }
            }}
          >
            Add person
          </Button>
        </>
      }
    >
      <form
        className="adm-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        {error ? (
          <div className="adm-banner tone-danger" role="alert" style={{ marginBottom: 0 }}>
            <Icon name="alert" size={18} />
            <span>{error}</span>
          </div>
        ) : null}
        <TextInput label="Full name" value={name} onChange={setName} autoComplete="off" maxLength={100} />
        <TextInput label="Email" type="email" value={email} onChange={setEmail} autoComplete="off" placeholder="name@meteo.gov.gh" />
        <RadioCards label="Role" value={role} onChange={setRole} options={ROLES} />
      </form>
    </Dialog>
  );
}
