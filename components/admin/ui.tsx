"use client";

import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Icon } from "@/components/admin/icons";
import type { IconName } from "@/components/admin/icons";

/* ------------------------------------------------------------------------------------------
 * Building blocks for the admin pages: buttons, badges, switches, dialogs, drawers, menus,
 * toasts and relative times. Patterns follow common design-system guidance (Polaris, Carbon,
 * Atlassian, GOV.UK): one polite live region for toasts, errors never in toasts, dialogs whose
 * confirm button repeats the title's verb, Escape and click-outside to close, focus returned.
 * ------------------------------------------------------------------------------------------ */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "danger-solid";
  size?: "sm" | "md";
  icon?: IconName;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, loading, children, className, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`adm-btn adm-btn-${variant} adm-btn-${size}${children ? "" : " adm-btn-icon"}${className ? ` ${className}` : ""}`}
    >
      {loading ? <span className="adm-spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
      {children}
    </button>
  );
});

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

export function Badge({ tone = "neutral", dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`adm-badge tone-${tone}`}>
      {dot ? <span className="adm-badge-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: ReactNode;
  id?: string;
}) {
  const auto = useId();
  const switchId = id ?? auto;
  return (
    <div className="adm-switch-row">
      <button
        type="button"
        role="switch"
        id={switchId}
        aria-checked={checked}
        aria-describedby={description ? `${switchId}-d` : undefined}
        className={`adm-switch${checked ? " on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="adm-switch-thumb" />
      </button>
      <label htmlFor={switchId} className="adm-switch-text">
        <span className="adm-switch-label">{label}</span>
        {description ? (
          <span className="adm-switch-desc" id={`${switchId}-d`}>
            {description}
          </span>
        ) : null}
      </label>
    </div>
  );
}

/* ---------------------------------------------------------------------------- relative time */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(iso: string, now = Date.now()) {
  const diff = now - new Date(iso).getTime();
  if (diff < 45_000) return "just now";
  if (diff < HOUR) return `${Math.round(diff / MINUTE)} min ago`;
  if (diff < DAY) {
    const hours = Math.round(diff / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (diff < 7 * DAY) {
    const days = Math.round(diff / DAY);
    return days === 1 ? "yesterday" : `${days} days ago`;
  }
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "5 min ago", with the exact time on hover; refreshes every minute. */
export function RelativeTime({ iso }: { iso: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), MINUTE);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {relativeTime(iso)}
    </time>
  );
}

/* ---------------------------------------------------------------------------------- dialogs */

/**
 * A modal built on <dialog>: the browser traps focus, Escape closes it and focus goes back to
 * whatever opened it. Clicking the backdrop closes it too (unless `dismissable` is false).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  role = "dialog",
  size = "md",
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  role?: "dialog" | "alertdialog";
  size?: "sm" | "md" | "lg";
  dismissable?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`adm-dialog adm-dialog-${size}`}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissable) onClose();
      }}
      onClick={(event) => {
        if (dismissable && event.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className="adm-dialog-inner">
          <header className="adm-dialog-head">
            <h2 id={titleId}>{title}</h2>
            {dismissable ? <Button variant="ghost" size="sm" icon="close" aria-label="Close" onClick={onClose} /> : null}
          </header>
          {description ? (
            <div className="adm-dialog-desc" id={descId}>
              {description}
            </div>
          ) : null}
          {children ? <div className="adm-dialog-body">{children}</div> : null}
          {footer ? <footer className="adm-dialog-foot">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  /** Repeats the title's verb, e.g. "Delete crop". */
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
};

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })),
    [],
  );

  // Focus the safe choice for destructive actions, the action otherwise.
  useEffect(() => {
    if (!request) return;
    const target = request.tone === "danger" ? cancelRef.current : confirmRef.current;
    window.requestAnimationFrame(() => target?.focus());
  }, [request]);

  const close = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={Boolean(request)}
        onClose={() => close(false)}
        title={request?.title ?? ""}
        description={request?.description}
        role="alertdialog"
        size="sm"
        footer={
          <>
            <Button ref={cancelRef} onClick={() => close(false)}>
              {request?.cancelLabel ?? "Cancel"}
            </Button>
            <Button ref={confirmRef} variant={request?.tone === "danger" ? "danger-solid" : "primary"} onClick={() => close(true)}>
              {request?.confirmLabel}
            </Button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}

/* ---------------------------------------------------------------------------------- toasts */

type Toast = { id: number; text: string; tone: "success" | "info" };

const ToastContext = createContext<(text: string, tone?: Toast["tone"]) => void>(() => undefined);

/** Short confirmations ("Thresholds saved"). Errors are shown on the page instead. */
export function useToast() {
  return useContext(ToastContext);
}

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const schedule = useCallback((id: number) => timers.current.set(id, window.setTimeout(() => dismiss(id), 5000)), [dismiss]);

  const show = useCallback(
    (text: string, tone: Toast["tone"] = "success") => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, text, tone }]);
      schedule(id);
    },
    [schedule],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="adm-toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`adm-toast tone-${toast.tone}`}
            onMouseEnter={() => window.clearTimeout(timers.current.get(toast.id))}
            onMouseLeave={() => schedule(toast.id)}
          >
            <Icon name={toast.tone === "success" ? "check" : "info"} size={17} />
            <span>{toast.text}</span>
            <button type="button" className="adm-toast-close" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
              <Icon name="close" size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------------- unsaved changes */

type GuardApi = { setDirty: (key: string, dirty: boolean) => void; isDirty: () => boolean };

const GuardContext = createContext<GuardApi>({ setDirty: () => undefined, isDirty: () => false });

export function useUnsavedGuard() {
  return useContext(GuardContext);
}

/**
 * Warns before leaving a page with unsaved changes: the browser's own prompt on reload or close,
 * and a "Leave page?" dialog when following a link inside the admin.
 */
function GuardProvider({ children }: { children: ReactNode }) {
  const dirty = useRef(new Set<string>());
  const [, rerender] = useState(0);
  const confirm = useConfirm();

  const api = useRef<GuardApi>({
    setDirty: (key, value) => {
      const had = dirty.current.has(key);
      if (value) dirty.current.add(key);
      else dirty.current.delete(key);
      if (had !== value) rerender((n) => n + 1);
    },
    isDirty: () => dirty.current.size > 0,
  }).current;

  const anyDirty = dirty.current.size > 0;

  useEffect(() => {
    if (!anyDirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  useEffect(() => {
    if (!anyDirty) return undefined;
    const intercept = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as HTMLElement | null)?.closest("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      void confirm({
        title: "Leave without saving?",
        description: "Your unsaved changes on this page will be lost.",
        confirmLabel: "Leave without saving",
        cancelLabel: "Keep editing",
        tone: "danger",
      }).then((leave) => {
        if (leave) {
          dirty.current.clear();
          window.location.assign(url.href);
        }
      });
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [anyDirty, confirm]);

  return <GuardContext.Provider value={api}>{children}</GuardContext.Provider>;
}

export function AdminProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <GuardProvider>{children}</GuardProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

/* ---------------------------------------------------------------------------------- drawer */

/** A panel that slides in from the right, for history and previews. Escape or the backdrop closes it. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="adm-drawer"
      style={{ width: `min(${width}px, 100vw)` }}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className="adm-drawer-inner">
          <header className="adm-drawer-head">
            <div>
              <h2 id={titleId}>{title}</h2>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            <Button variant="ghost" size="sm" icon="close" aria-label="Close" onClick={onClose} />
          </header>
          <div className="adm-drawer-body">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}

/* ------------------------------------------------------------------------------------ menu */

export type MenuItem = { label: string; icon?: IconName; onSelect: () => void; tone?: "danger"; disabled?: boolean };

/** A "⋯" button with a short list of actions. Arrow keys move, Escape closes. */
export function Menu({ items, label = "More actions" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus());
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) return;
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    }
  };

  return (
    <div className="adm-menu" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="adm-btn adm-btn-ghost adm-btn-md adm-btn-icon"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="more" size={18} />
      </button>
      {open ? (
        <div className="adm-menu-list" role="menu" id={menuId}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={item.tone === "danger" ? "danger" : undefined}
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
                item.onSelect();
              }}
            >
              {item.icon ? <Icon name={item.icon} size={16} /> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ empty & loading */

export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="adm-empty">
      <span className="adm-empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/** Placeholder blocks shaped like the form, shown only if loading takes longer than a moment. */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 250);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="adm-card" aria-hidden="true">
      <div className="adm-skel" style={{ width: "30%", height: 18, marginBottom: 18 }} />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} style={{ marginBottom: 16 }}>
          <div className="adm-skel" style={{ width: "22%", height: 12, marginBottom: 8 }} />
          <div className="adm-skel" style={{ width: "100%", height: 36 }} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------------- page head */

export function PageHeader({
  title,
  description,
  status,
  actions,
}: {
  title: string;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="adm-page-head">
      <div className="adm-page-titles">
        <h1>{title}</h1>
        {description ? <p className="adm-page-desc">{description}</p> : null}
        {status ? <div className="adm-page-status">{status}</div> : null}
      </div>
      {actions ? <div className="adm-page-actions">{actions}</div> : null}
    </header>
  );
}

/** Copies text, saying so on the button for a moment. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      icon={copied ? "check" : "copy"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked: the text stays selectable on screen.
        }
      }}
    >
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}
