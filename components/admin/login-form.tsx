"use client";

import { useRef, useState } from "react";

import { Field } from "@/components/admin/fields";
import { Icon } from "@/components/admin/icons";
import { Button } from "@/components/admin/ui";

/** A password box with show/hide and a Caps Lock warning. */
export function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  help,
  error,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  help?: React.ReactNode;
  error?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const [shown, setShown] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  return (
    <Field label={label} help={capsLock ? <span className="adm-hint warn">Caps Lock is on</span> : help} error={error}>
      {({ id, describedBy, invalid }) => (
        <div className="adm-password">
          <input
            ref={inputRef}
            id={id}
            className="adm-input"
            type={shown ? "text" : "password"}
            value={value}
            autoComplete={autoComplete}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
            onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
            onBlur={() => setCapsLock(false)}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={shown ? "eyeOff" : "eye"}
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            onClick={() => setShown((value) => !value)}
          />
        </div>
      )}
    </Field>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  return (
    <form
      noValidate
      className="adm-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!email.trim() || !password) {
          setError("Enter your email and password");
          return;
        }
        setBusy(true);
        setError(null);
        try {
          const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          if (response.ok) {
            window.location.assign(next);
            return;
          }
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? "Could not sign in");
          setPassword("");
          passwordRef.current?.focus();
        } catch {
          setError("No connection. Check your internet and try again.");
        }
        setBusy(false);
      }}
    >
      {error ? (
        <div className="adm-banner tone-danger" role="alert" style={{ marginBottom: 0 }}>
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      ) : null}
      <Field label="Email">
        {({ id }) => (
          <input
            id={id}
            className="adm-input"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
      </Field>
      <PasswordInput label="Password" value={password} onChange={setPassword} autoComplete="current-password" inputRef={passwordRef} />
      <Button type="submit" variant="primary" loading={busy} data-testid="admin-login" style={{ width: "100%", height: 40 }}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
