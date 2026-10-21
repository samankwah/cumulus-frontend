"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { Icon } from "@/components/admin/icons";

/* ------------------------------------------------------------------------------------------
 * A dropdown drawn in the admin's own style (the browser's native list can't be styled). It
 * follows the ARIA "select-only combobox" pattern: the button holds focus, arrow keys move
 * through the options, Enter or Space picks, Escape closes, and typing a letter jumps to the
 * next option starting with it. The list opens upwards when there is no room below.
 * ------------------------------------------------------------------------------------------ */

export type SelectOption<T extends string> = { value: T; label: string; swatch?: string };

export function Select<T extends string>({
  value,
  onChange,
  options,
  id,
  ariaLabel,
  describedBy,
  invalid,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  id?: string;
  ariaLabel?: string;
  describedBy?: string;
  invalid?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex];

  const openList = () => {
    // Open upwards when the list would run off the bottom of the window.
    const box = buttonRef.current?.getBoundingClientRect();
    const height = Math.min(280, options.length * 38 + 12);
    setAbove(Boolean(box && window.innerHeight - box.bottom < height + 16 && box.top > height + 16));
    setActive(selectedIndex);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  // Keep the highlighted option in view while moving with the keyboard.
  useLayoutEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const last = options.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => Math.min(last, index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => Math.max(0, index - 1));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(last);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (event.key.length === 1 && /\S/.test(event.key)) {
          const now = Date.now();
          typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + event.key.toLowerCase(), at: now };
          const start = typed.current.text.length > 1 ? active : active + 1;
          const order = [...options.keys()].map((n) => (start + n) % options.length);
          const match = order.find((n) => options[n].label.toLowerCase().startsWith(typed.current.text));
          if (match !== undefined) setActive(match);
        }
    }
  };

  return (
    <div className={`adm-select-root${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className={`adm-input adm-select-button${open ? " open" : ""}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        {selected?.swatch ? <span className="adm-select-swatch" style={{ background: selected.swatch }} aria-hidden="true" /> : null}
        <span className="adm-select-value">{selected?.label ?? ""}</span>
        <Icon name="chevronRight" size={15} className="adm-select-chevron" />
      </button>
      {open ? (
        <ul ref={listRef} id={listId} role="listbox" aria-label={ariaLabel} className={`adm-select-list${above ? " above" : ""}`} tabIndex={-1}>
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              data-index={index}
              role="option"
              aria-selected={option.value === value}
              className={`${index === active ? "active" : ""}${option.value === value ? " selected" : ""}`}
              onPointerEnter={() => setActive(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              {option.swatch ? <span className="adm-select-swatch" style={{ background: option.swatch }} aria-hidden="true" /> : null}
              <span className="adm-select-label">{option.label}</span>
              {option.value === value ? <Icon name="check" size={15} className="adm-select-check" /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
