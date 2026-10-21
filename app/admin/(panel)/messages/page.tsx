"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";

import { AdvisoryPreview } from "@/components/admin/advisory-preview";
import { DocumentEditor } from "@/components/admin/document-editor";
import { AutoTextarea, Segmented, fieldId } from "@/components/admin/fields";
import { HighlightedTemplate } from "@/components/admin/highlight";
import { Icon } from "@/components/admin/icons";
import { Button, EmptyState } from "@/components/admin/ui";
import { ADVISORY_MESSAGE_DEFAULTS, placeholdersIn } from "@/lib/content/advisory-messages";
import type { AdvisoryMessageId, AdvisoryMessages } from "@/lib/content/advisory-messages";
import { allowedPlaceholders } from "@/lib/content/documents";

const IDS = Object.keys(ADVISORY_MESSAGE_DEFAULTS) as AdvisoryMessageId[];

const GROUPS: { prefix: string; title: string; about: string }[] = [
  { prefix: "headline", title: "Headlines", about: "The bold line at the top of the advisory." },
  { prefix: "advice", title: "Advice", about: "The dated actions under Crops, Pests & disease and Livestock & water." },
  { prefix: "outlook", title: "Outlook", about: "One sentence on the weather ahead." },
  { prefix: "impact", title: "Impact", about: "What that weather means for farming now." },
  { prefix: "signal", title: "Forecast facts", about: "The facts listed under “why”." },
  { prefix: "when", title: "Date labels", about: "The left-hand column of each action: Now, From 9 Oct, …" },
  { prefix: "spell", title: "Spell dates", about: "Small pieces used inside other sentences." },
  { prefix: "context", title: "Ended forecast", about: "Shown when the forecast run is over." },
  { prefix: "panel", title: "Panel labels", about: "Headings in the advisory box." },
  { prefix: "word", title: "Joining words", about: "Used to join lists." },
];

/** The advice messages, split by the map layer they belong to (first id of each part). */
const ADVICE_PARTS: [AdvisoryMessageId, string][] = [
  ["advice.expiredCheckBack", "Harvest and field work"],
  ["advice.harvestBetweenShowers", "Rainfall layer"],
  ["advice.postponeSprayingHarvest", "Rain days layer"],
  ["advice.noDrySpellPlanting", "Dry spells layer"],
  ["advice.noWetSpellHarvest", "Wet spells layer"],
  ["advice.seeOtherLayers", "Onset layer"],
  ["advice.checkDryPests", "Pests, livestock & water"],
];

const PART_OF = (() => {
  const map = new Map<AdvisoryMessageId, string>();
  let part = "";
  IDS.forEach((id) => {
    const start = ADVICE_PARTS.find(([first]) => first === id);
    if (start) part = start[1];
    if (id.startsWith("advice.")) map.set(id, part);
  });
  return map;
})();

/** Example values for the line under each message. */
const EXAMPLES: Record<string, string | number> = {
  crop: "maize",
  cropLabel: "Maize",
  criticalStage: "tasselling and silking",
  harvestRisk: "cobs rot and grain moulds (aflatoxin) if harvested or dried wet",
  dryPests: "fall armyworm and stem borers",
  wetDiseases: "leaf blight and ear rot",
  stage: "crop growing",
  crops: "growing maize",
  date: "Thu 9 Oct",
  dates: "9–11 Oct",
  days: 5,
  amount: "32.0 mm",
  mm: 30,
  count: 2,
  rainDays: 8,
  dryRun: 4,
  when: "9–11 Oct",
  spell: "9–14 Oct (6 days)",
  spells: "20–24 Oct (5 days)",
  more: ", then 20–24 Oct (5 days)",
  later: " and later",
  chance: 25,
  guardDays: 18,
  checkDays: 30,
  maxDry: 10,
  dryDays: 11,
};

/** "advice.plantAfterRain" → "Plant after rain". */
function nameOf(id: string) {
  const words = id.split(".")[1].replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type Check = { unknown: string[]; missing: string[]; empty: boolean };

function check(id: AdvisoryMessageId, text: string): Check {
  const allowed = allowedPlaceholders(id);
  const used = placeholdersIn(text);
  const lower = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);
  return {
    unknown: used.filter((name) => !allowed.includes(name) && !allowed.includes(lower(name))),
    missing: placeholdersIn(ADVISORY_MESSAGE_DEFAULTS[id]).filter((name) => !used.some((u) => lower(u) === lower(name))),
    empty: !text.trim(),
  };
}

type Filter = "all" | "edited" | "problems";

export default function MessagesPage() {
  return (
    <DocumentEditor
      sectionKey="messages"
      title="Advisory messages"
      noun="Messages"
      description={
        <>
          Every sentence the farm advisory can show. Words in braces are filled in for you: <code>{"{crop}"}</code> becomes the chosen crop,{" "}
          <code>{"{date}"}</code> a date. Write <code>{"{Crop}"}</code> with a capital to start a sentence with it.
        </>
      }
      // Stored: only the messages that differ from the defaults. Edited here: the full list.
      fromStored={(overrides): AdvisoryMessages => ({ ...ADVISORY_MESSAGE_DEFAULTS, ...(overrides as Partial<AdvisoryMessages>) })}
      toStored={(draft) => Object.fromEntries(IDS.filter((id) => draft[id] !== ADVISORY_MESSAGE_DEFAULTS[id]).map((id) => [id, draft[id]]))}
      describeChange={(path) => (path in ADVISORY_MESSAGE_DEFAULTS ? nameOf(path) : path)}
      preview={(draft) => <AdvisoryPreview apply={(content) => ({ ...content, messages: draft })} />}
    >
      {({ draft, setDraft, issues }) => <MessageList draft={draft} setDraft={setDraft} issues={issues} />}
    </DocumentEditor>
  );
}

function MessageList({
  draft,
  setDraft,
  issues,
}: {
  draft: AdvisoryMessages;
  setDraft: (update: (draft: AdvisoryMessages) => AdvisoryMessages) => void;
  issues: Record<string, string>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const setDraftRef = useRef(setDraft);
  setDraftRef.current = setDraft;
  const onChange = useCallback((id: AdvisoryMessageId, value: string) => setDraftRef.current((d) => ({ ...d, [id]: value })), []);

  const checks = useMemo(() => Object.fromEntries(IDS.map((id) => [id, check(id, draft[id])])) as Record<AdvisoryMessageId, Check>, [draft]);
  const isEdited = (id: AdvisoryMessageId) => draft[id] !== ADVISORY_MESSAGE_DEFAULTS[id];
  const hasProblem = (id: AdvisoryMessageId) => Boolean(issues[id]) || checks[id].unknown.length > 0 || checks[id].missing.length > 0 || checks[id].empty;
  const editedCount = IDS.filter(isEdited).length;
  const problemCount = IDS.filter(hasProblem).length;

  const needle = query.trim().toLowerCase();
  const shown = IDS.filter((id) => {
    if (filter === "edited" && !isEdited(id)) return false;
    if (filter === "problems" && !hasProblem(id)) return false;
    if (!needle) return true;
    return (
      draft[id].toLowerCase().includes(needle) ||
      ADVISORY_MESSAGE_DEFAULTS[id].toLowerCase().includes(needle) ||
      nameOf(id).toLowerCase().includes(needle) ||
      id.toLowerCase().includes(needle)
    );
  });
  const groups = GROUPS.map((group) => ({ ...group, ids: shown.filter((id) => id.split(".")[0] === group.prefix) })).filter((group) => group.ids.length);

  return (
    <div className="adm-msg-layout">
      <nav className="adm-msg-toc" aria-label="Message groups">
        {groups.map((group) => (
          <a key={group.prefix} href={`#group-${group.prefix}`}>
            <span>{group.title}</span>
            <span>{group.ids.length}</span>
          </a>
        ))}
      </nav>
      <div>
        <div className="adm-toolbar">
          <div className="adm-search">
            <Icon name="search" size={16} />
            <input
              type="search"
              className="adm-input"
              placeholder="Search, e.g. plant, heavy rain, fertilizer"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search messages"
            />
          </div>
          <Segmented<Filter>
            label="Show"
            hideLabel
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All ${IDS.length}` },
              { value: "edited", label: `Edited ${editedCount}` },
              { value: "problems", label: `Needs a look ${problemCount}` },
            ]}
          />
        </div>
        {groups.length === 0 ? (
          <div className="adm-card">
            <EmptyState
              icon="search"
              title="No messages match"
              action={
                <Button
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Clear search and filters
                </Button>
              }
            >
              {filter === "edited" && !needle ? "No message has been edited yet." : "Try another word, or clear the filters."}
            </EmptyState>
          </div>
        ) : null}
        {groups.map((group) => (
          <section className="adm-card adm-msg-group" key={group.prefix} id={`group-${group.prefix}`} aria-labelledby={`title-${group.prefix}`}>
            <header>
              <h2 id={`title-${group.prefix}`}>{group.title}</h2>
              <p>{group.about}</p>
            </header>
            {group.ids.map((id, index) => {
              const part = PART_OF.get(id);
              const startsPart = part && (index === 0 || PART_OF.get(group.ids[index - 1]) !== part);
              return (
                <div key={id}>
                  {startsPart ? <div className="adm-msg-sub">{part}</div> : null}
                  <MessageRow id={id} value={draft[id]} serverError={issues[id]} onChange={onChange} />
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

const MessageRow = memo(function MessageRow({
  id,
  value,
  serverError,
  onChange,
}: {
  id: AdvisoryMessageId;
  value: string;
  serverError?: string;
  onChange: (id: AdvisoryMessageId, value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  // Worked out here from the text alone, so typing in one message does not redraw the others.
  const checked = useMemo(() => check(id, value), [id, value]);
  const original = ADVISORY_MESSAGE_DEFAULTS[id];
  const edited = value !== original;
  const allowed = allowedPlaceholders(id);
  const own = placeholdersIn(original);
  // The message's own placeholders first, then the shared crop words.
  const chips = [...own, ...allowed.filter((name) => !own.includes(name))];

  const insert = (name: string) => {
    const element = ref.current;
    const token = `{${name}}`;
    if (!element) {
      onChange(id, `${value}${token}`);
      return;
    }
    // At the cursor if the box has been used; otherwise at the end.
    const focused = document.activeElement === element;
    const start = focused ? element.selectionStart : value.length;
    const end = focused ? element.selectionEnd : value.length;
    const before = value.slice(0, start);
    const spaced = before && !/\s$/.test(before) ? ` ${token}` : token;
    onChange(id, `${before}${spaced}${value.slice(end)}`);
    window.requestAnimationFrame(() => {
      element.focus();
      const caret = start + spaced.length;
      element.setSelectionRange(caret, caret);
    });
  };

  const error =
    serverError ??
    (checked.empty
      ? "Empty: nothing would be shown here."
      : checked.unknown.length
        ? `Not a placeholder this message can use: ${checked.unknown.map((name) => `{${name}}`).join(", ")}`
        : undefined);

  return (
    <div className={`adm-msg${edited ? " edited" : ""}${error ? " has-error" : ""}`} data-testid={`admin-message-${id}`}>
      <div className="adm-msg-top">
        <label htmlFor={fieldId(id)}>
          <span className="adm-msg-name">{nameOf(id)}</span>
          <span className="adm-msg-id">{id}</span>
        </label>
        {edited ? (
          <span className="adm-modified">
            <span className="adm-modified-dot" aria-hidden="true" />
            Edited
            <button type="button" className="adm-text-btn" onClick={() => onChange(id, original)}>
              Reset
            </button>
          </span>
        ) : null}
      </div>
      {error ? <p className="adm-error-text">{error}</p> : null}
      <AutoTextarea
        id={fieldId(id)}
        textareaRef={ref}
        value={value}
        minRows={1}
        aria-invalid={Boolean(error) || undefined}
        onChange={(next) => onChange(id, next)}
      />
      {checked.missing.length && !checked.empty ? (
        <p className="adm-msg-warn">
          The original uses {checked.missing.map((name) => `{${name}}`).join(", ")}, which this text no longer has. That is fine if you meant to leave it out.
        </p>
      ) : null}
      <div className="adm-msg-tools">
        <span className="adm-hint">Insert:</span>
        {chips.map((name) => (
          <button
            type="button"
            className={`adm-chip${checked.missing.includes(name) ? " missing" : ""}`}
            key={name}
            title={own.includes(name) ? "Used by the original text" : "Available in every message"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insert(name)}
          >
            {`{${name}}`}
          </button>
        ))}
      </div>
      {placeholdersIn(value).length ? (
        <p className="adm-preview">
          <span className="adm-preview-label">Example</span>
          <HighlightedTemplate template={value} vars={EXAMPLES} />
        </p>
      ) : null}
      {edited ? (
        <p className="adm-hint" style={{ marginTop: 6 }}>
          Original: {original}
        </p>
      ) : null}
    </div>
  );
});
