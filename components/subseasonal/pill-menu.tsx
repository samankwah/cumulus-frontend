"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export type PillMenuOption = {
  value: string;
  label: string;
  /** A second, quieter line: "Ensemble of 10", "Latest", "Data coming soon". */
  detail?: string;
  /** A small tag beside the label, e.g. "Demo". */
  badge?: string;
  disabled?: boolean;
};

/**
 * A pill that opens a small menu card, styled like the rest of the panel (the browser's native
 * select list cannot be styled). Keyboard: Enter/Space/↓ open; ↑ ↓ Home End move; Enter picks;
 * Escape or Tab close. A click outside closes it.
 */
export function PillMenu({
  value,
  options,
  onChange,
  label,
  trigger,
  className = "",
  testId,
  align = "start",
}: {
  value: string;
  options: PillMenuOption[];
  onChange: (value: string) => void;
  /** Accessible name, e.g. "Forecast model". */
  label: string;
  trigger: ReactNode;
  className?: string;
  testId?: string;
  /** Which edge of the pill the menu lines up with. */
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const enabled = options.map((option, position) => (option.disabled ? -1 : position)).filter((position) => position >= 0);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const openMenu = () => {
    const selected = options.findIndex((option) => option.value === value);
    setActive(selected >= 0 && !options[selected].disabled ? selected : (enabled[0] ?? 0));
    setOpen(true);
  };

  // Close on a click or tap anywhere else.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close, open]);

  // Keyboard focus follows the active option.
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.focus();
  }, [active, open]);

  const pick = (option: PillMenuOption) => {
    if (option.disabled) return;
    close(true);
    if (option.value !== value) onChange(option.value);
  };

  const move = (step: number) => {
    const at = enabled.indexOf(active);
    const next = enabled[(at + step + enabled.length) % enabled.length];
    if (next !== undefined) setActive(next);
  };

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    }
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(enabled[0] ?? 0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(enabled[enabled.length - 1] ?? 0);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[active];
      if (option) pick(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  return (
    <span ref={rootRef} className={`ss-pill-menu ${className}${open ? " open" : ""}`}>
      <button
        ref={buttonRef}
        type="button"
        className="ss-pill-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        data-testid={testId}
        data-value={value}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onButtonKeyDown}
      >
        {trigger}
        <svg className="ss-pill-chevron" viewBox="0 0 20 20" focusable="false" aria-hidden="true">
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>
      {open ? (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          className={`ss-pill-list align-${align}`}
          onKeyDown={onListKeyDown}
          data-testid={testId ? `${testId}-menu` : undefined}
        >
          {options.map((option, position) => {
            const selected = option.value === value;
            return (
              <div
                key={option.value}
                role="option"
                aria-selected={selected}
                aria-disabled={option.disabled || undefined}
                tabIndex={position === active ? 0 : -1}
                data-index={position}
                data-testid={testId ? `${testId}-option-${option.value}` : undefined}
                className={`ss-pill-option${selected ? " selected" : ""}${option.disabled ? " disabled" : ""}${position === active ? " active" : ""}`}
                onMouseEnter={() => !option.disabled && setActive(position)}
                onClick={() => pick(option)}
              >
                <div className="ss-pill-option-text">
                  <strong>
                    {option.label}
                    {option.badge ? <em className="ss-pill-option-badge">{option.badge}</em> : null}
                  </strong>
                  {option.detail ? <small>{option.detail}</small> : null}
                </div>
                {selected ? (
                  <svg className="ss-pill-check" viewBox="0 0 20 20" focusable="false" aria-hidden="true">
                    <path d="m5 10.5 3.2 3.2L15 7" />
                  </svg>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </span>
  );
}
