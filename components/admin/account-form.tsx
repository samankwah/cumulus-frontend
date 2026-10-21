"use client";

import { useState } from "react";

import { Icon } from "@/components/admin/icons";
import { PasswordInput } from "@/components/admin/login-form";
import { Button, useToast } from "@/components/admin/ui";

const MIN_LENGTH = 10;

export function AccountForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const rules = [
    { ok: newPassword.length >= MIN_LENGTH, text: `At least ${MIN_LENGTH} characters` },
    { ok: Boolean(newPassword) && newPassword !== currentPassword, text: "Different from your current password" },
    { ok: Boolean(repeat) && repeat === newPassword, text: "Both new passwords match" },
  ];
  const ready = Boolean(currentPassword) && rules.every((rule) => rule.ok);

  return (
    <form
      className="adm-card adm-section"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (!ready) {
          setError("Check the password rules below");
          return;
        }
        setBusy(true);
        setError(null);
        try {
          const response = await fetch("/api/admin/account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPassword, newPassword }),
          });
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (response.ok) {
            toast("Password changed");
            setCurrentPassword("");
            setNewPassword("");
            setRepeat("");
          } else {
            setError(body.error ?? "Could not change the password");
          }
        } catch {
          setError("No connection. Check your internet and try again.");
        }
        setBusy(false);
      }}
    >
      <div className="adm-section-head">
        <div>
          <h2>Change password</h2>
          <p>You stay signed in here. Other browsers are signed out.</p>
        </div>
      </div>
      <div className="adm-stack">
        {error ? (
          <div className="adm-banner tone-danger" role="alert" style={{ marginBottom: 0 }}>
            <Icon name="alert" size={18} />
            <span>{error}</span>
          </div>
        ) : null}
        <PasswordInput label="Current password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
        <PasswordInput label="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" help="A short sentence is easy to remember and hard to guess." />
        <PasswordInput label="New password again" value={repeat} onChange={setRepeat} autoComplete="new-password" />
        <ul className="adm-checklist adm-small" aria-label="Password rules">
          {rules.map((rule) => (
            <li key={rule.text}>
              <span className={rule.ok ? "adm-check-ok" : "adm-muted"}>
                <Icon name={rule.ok ? "check" : "dot"} size={16} />
              </span>
              <span className={rule.ok ? undefined : "adm-muted"}>{rule.text}</span>
            </li>
          ))}
        </ul>
        <div>
          <Button type="submit" variant="primary" loading={busy} disabled={!ready}>
            Change password
          </Button>
        </div>
      </div>
    </form>
  );
}
