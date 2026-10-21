"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Icon } from "@/components/admin/icons";

/* ------------------------------------------------------------------------------------------
 * Form fields for the admin pages. A field given a `path` (e.g. "about.body", "2.label") picks
 * up its server validation message from the editor and gets the id the error summary links to.
 * Given a `defaultValue`, it marks itself "Edited" when it differs and offers "Reset".
 * ------------------------------------------------------------------------------------------ */

export const FieldIssuesContext = createContext<Record<string, string>>({});

export function fieldId(path: string) {
  return `field-${path.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function useFieldError(path?: string, error?: string) {
  const issues = useContext(FieldIssuesContext);
  if (error) return error;
  if (path === undefined) return undefined;
  return issues[path];
}

type FieldProps = {
  label: string;
  /** Where server validation reports this field, and what the error summary links to. */
  path?: string;
  help?: ReactNode;
  error?: string;
  /** Marks the field "Edited" and offers a reset when the value differs from this. */
  isModified?: boolean;
  onReset?: () => void;
  /** Characters used / allowed, shown under the field. */
  count?: { used: number; max: number };
  optional?: boolean;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
};

export function Field({ label, path, help, error, isModified, onReset, count, optional, children }: FieldProps) {
  const auto = useId();
  const id = path !== undefined ? fieldId(path) : auto;
  const message = useFieldError(path, error);
  const helpId = help ? `${id}-help` : undefined;
  const errorId = message ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;
  // Only worth showing once the text gets close to the limit.
  const showCount = count && count.used >= count.max * 0.8;
  return (
    <div className={`adm-field${message ? " has-error" : ""}`}>
      <div className="adm-field-top">
        <label htmlFor={id} className="adm-label">
          {label}
          {optional ? <span className="adm-optional"> (optional)</span> : null}
        </label>
        {isModified ? (
          <span className="adm-modified">
            <span className="adm-modified-dot" aria-hidden="true" />
            Edited
            {onReset ? (
              <button type="button" className="adm-text-btn" onClick={onReset}>
                Reset
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {message ? (
        <p className="adm-error-text" id={errorId}>
          <span className="adm-sr">Error: </span>
          {message}
        </p>
      ) : null}
      {children({ id, describedBy, invalid: Boolean(message) })}
      {help || showCount ? (
        <div className="adm-field-foot">
          {help ? (
            <p className="adm-hint" id={helpId}>
              {help}
            </p>
          ) : (
            <span />
          )}
          {showCount && count ? (
            <span className={`adm-count${count.used > count.max ? " over" : ""}`} aria-live="off">
              {count.used}/{count.max}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type Shared = Omit<FieldProps, "children" | "isModified" | "onReset"> & { defaultValue?: string; placeholder?: string };

export function TextInput({
  value,
  onChange,
  type = "text",
  defaultValue,
  placeholder,
  maxLength,
  autoComplete,
  ...field
}: Shared & {
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "url" | "tel";
  maxLength?: number;
  autoComplete?: string;
}) {
  return (
    <Field
      {...field}
      isModified={defaultValue !== undefined && value !== defaultValue}
      onReset={defaultValue !== undefined ? () => onChange(defaultValue) : undefined}
      count={maxLength ? { used: value.length, max: maxLength } : undefined}
    >
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          type={type}
          className="adm-input"
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

/** A textarea that grows with its text, so short templates stay one line and long ones show in full. */
export function AutoTextarea({
  value,
  onChange,
  minRows = 2,
  textareaRef,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  minRows?: number;
  textareaRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      {...props}
      ref={(element) => {
        ref.current = element;
        if (textareaRef) textareaRef.current = element;
      }}
      rows={minRows}
      className={`adm-input adm-textarea${props.className ? ` ${props.className}` : ""}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  defaultValue,
  placeholder,
  maxLength,
  rows = 3,
  ...field
}: Shared & { value: string; onChange: (value: string) => void; maxLength?: number; rows?: number }) {
  return (
    <Field
      {...field}
      isModified={defaultValue !== undefined && value !== defaultValue}
      onReset={defaultValue !== undefined ? () => onChange(defaultValue) : undefined}
      count={maxLength ? { used: value.length, max: maxLength } : undefined}
    >
      {({ id, describedBy, invalid }) => (
        <AutoTextarea
          id={id}
          value={value}
          onChange={onChange}
          minRows={rows}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      )}
    </Field>
  );
}

/**
 * A number with its unit inside the box. Typing is kept as text until it is a valid number, so
 * "0." or "-" can be typed; an empty box is sent as NaN for the server to flag.
 */
export function NumberInput({
  value,
  onChange,
  unit,
  defaultValue,
  step,
  min,
  max,
  ...field
}: Omit<Shared, "defaultValue"> & {
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  defaultValue?: number;
  step?: number;
  min?: number;
  max?: number;
}) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : "");
  useEffect(() => {
    // Follow outside changes (reset, discard) without fighting the user's typing.
    if (Number(text) !== value && !(text === "" && !Number.isFinite(value))) {
      setText(Number.isFinite(value) ? String(value) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Field
      {...field}
      isModified={defaultValue !== undefined && value !== defaultValue}
      onReset={defaultValue !== undefined ? () => onChange(defaultValue) : undefined}
    >
      {({ id, describedBy, invalid }) => (
        <div className="adm-affix">
          <input
            id={id}
            className="adm-input"
            inputMode="decimal"
            value={text}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => {
              const next = event.target.value.replace(",", ".");
              setText(next);
              const parsed = next.trim() === "" ? Number.NaN : Number(next);
              onChange(Number.isFinite(parsed) ? parsed : Number.NaN);
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              event.preventDefault();
              const delta = (step ?? 1) * (event.key === "ArrowUp" ? 1 : -1);
              let next = Math.round(((Number.isFinite(value) ? value : 0) + delta) * 1000) / 1000;
              if (min !== undefined) next = Math.max(min, next);
              if (max !== undefined) next = Math.min(max, next);
              setText(String(next));
              onChange(next);
            }}
          />
          {unit ? <span className="adm-affix-unit">{unit}</span> : null}
        </div>
      )}
    </Field>
  );
}

export function SelectInput<T extends string>({
  value,
  onChange,
  options,
  defaultValue,
  ...field
}: Omit<Shared, "defaultValue"> & { value: T; onChange: (value: T) => void; options: { value: T; label: string }[]; defaultValue?: T }) {
  return (
    <Field
      {...field}
      isModified={defaultValue !== undefined && value !== defaultValue}
      onReset={defaultValue !== undefined ? () => onChange(defaultValue) : undefined}
    >
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          className="adm-input adm-select"
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value as T)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function DateInput({
  value,
  onChange,
  ...field
}: Omit<Shared, "defaultValue"> & { value: string | null; onChange: (value: string | null) => void }) {
  return (
    <Field {...field}>
      {({ id, describedBy, invalid }) => (
        <div className="adm-affix">
          <input
            id={id}
            type="date"
            className="adm-input"
            value={value ?? ""}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value || null)}
          />
          {value ? (
            <button type="button" className="adm-affix-clear" aria-label={`Clear ${field.label}`} onClick={() => onChange(null)}>
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </div>
      )}
    </Field>
  );
}

/** One choice from a few, shown side by side (like iOS segmented controls). */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  path,
  help,
  hideLabel,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; tone?: string }[];
  path?: string;
  help?: ReactNode;
  /** Keep the label for screen readers only, e.g. in a toolbar. */
  hideLabel?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="adm-field adm-fieldset" id={path !== undefined ? fieldId(path) : undefined}>
      <legend className={hideLabel ? "adm-sr" : "adm-label"}>{label}</legend>
      <div className="adm-segmented" role="radiogroup">
        {options.map((option) => (
          <label key={option.value} className={`adm-segment${value === option.value ? " on" : ""}${option.tone ? ` tone-${option.tone}` : ""}`}>
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            {option.tone ? <span className="adm-segment-dot" aria-hidden="true" /> : null}
            {option.label}
          </label>
        ))}
      </div>
      {help ? <p className="adm-hint">{help}</p> : null}
    </fieldset>
  );
}

/** Choices with a line of explanation each, e.g. user roles. */
export function RadioCards<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; description: string }[];
}) {
  const name = useId();
  return (
    <fieldset className="adm-field adm-fieldset">
      <legend className="adm-label">{label}</legend>
      <div className="adm-radio-cards">
        {options.map((option) => (
          <label key={option.value} className={`adm-radio-card${value === option.value ? " on" : ""}`}>
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span>
              <strong>{option.label}</strong>
              <span className="adm-hint">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * A list of short names as removable tags. Enter or comma adds what is typed; Backspace in the
 * empty box removes the last tag; suggestions offer known names not yet used anywhere.
 */
export function TagInput({
  label,
  values,
  onChange,
  suggestions = [],
  path,
  help,
  placeholder = "Type a name and press Enter",
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  path?: string;
  help?: ReactNode;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const message = useFieldError(path);
  const id = path !== undefined ? fieldId(path) : listId;

  const add = (raw: string) => {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (values.some((value) => value.toLowerCase() === name.toLowerCase())) {
      setNote(`${name} is already in the list`);
      return;
    }
    onChange([...values, name]);
    setText("");
    setNote(null);
  };

  const open = suggestions.filter(
    (name) => !values.includes(name) && (!text || name.toLowerCase().includes(text.trim().toLowerCase())),
  );

  return (
    <div className={`adm-field${message ? " has-error" : ""}`}>
      <label htmlFor={id} className="adm-label">
        {label}
      </label>
      {message ? <p className="adm-error-text">{message}</p> : null}
      <div className="adm-tags" onClick={() => inputRef.current?.focus()}>
        {values.map((value, index) => (
          <span className="adm-tag" key={value}>
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={(event) => {
                event.stopPropagation();
                onChange(values.filter((_, i) => i !== index));
              }}
            >
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          value={text}
          placeholder={values.length ? "" : placeholder}
          list={suggestions.length ? `${listId}-list` : undefined}
          onChange={(event) => {
            const next = event.target.value;
            if (next.includes(",")) {
              next.split(",").slice(0, -1).forEach(add);
              setText(next.split(",").pop() ?? "");
            } else {
              setText(next);
              setNote(null);
              // Picking from the datalist fills the box with a whole suggestion: add it straight away.
              if (suggestions.includes(next)) add(next);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add(text);
            } else if (event.key === "Backspace" && !text && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => add(text)}
        />
        {suggestions.length ? (
          <datalist id={`${listId}-list`}>
            {open.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        ) : null}
      </div>
      {note ? <p className="adm-hint warn">{note}</p> : help ? <p className="adm-hint">{help}</p> : null}
    </div>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** A month-day ("03-15") as a month list plus a day list, so no one has to type the format. */
export function MonthDayInput({
  value,
  onChange,
  label,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid?: boolean;
}) {
  const [month, day] = value.split("-").map(Number);
  const safeMonth = month >= 1 && month <= 12 ? month : 1;
  const maxDay = DAYS_IN_MONTH[safeMonth - 1];
  const safeDay = day >= 1 && day <= maxDay ? day : 1;
  const set = (m: number, d: number) => onChange(`${String(m).padStart(2, "0")}-${String(Math.min(d, DAYS_IN_MONTH[m - 1])).padStart(2, "0")}`);
  return (
    <div className="adm-monthday" role="group" aria-label={label}>
      <select
        className="adm-input adm-select"
        aria-label={`${label}: day`}
        aria-invalid={invalid || undefined}
        value={safeDay}
        onChange={(event) => set(safeMonth, Number(event.target.value))}
      >
        {Array.from({ length: maxDay }, (_, index) => (
          <option key={index + 1} value={index + 1}>
            {index + 1}
          </option>
        ))}
      </select>
      <select
        className="adm-input adm-select"
        aria-label={`${label}: month`}
        aria-invalid={invalid || undefined}
        value={safeMonth}
        onChange={(event) => set(Number(event.target.value), safeDay)}
      >
        {MONTHS.map((name, index) => (
          <option key={name} value={index + 1}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
