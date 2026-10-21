"use client";

import { DocumentEditor } from "@/components/admin/document-editor";
import { DateInput, Segmented, TextArea, TextInput } from "@/components/admin/fields";
import { Badge, Button, EmptyState, Menu, Switch, useConfirm } from "@/components/admin/ui";
import type { Tone } from "@/components/admin/ui";
import type { Announcement, AnnouncementLevel } from "@/lib/content/site-content";
import { todayIso } from "@/lib/subseasonal";

const LEVELS: { value: AnnouncementLevel; label: string; tone: string }[] = [
  { value: "info", label: "Information", tone: "info" },
  { value: "warning", label: "Warning", tone: "warning" },
  { value: "urgent", label: "Urgent", tone: "urgent" },
];

function newAnnouncement(): Announcement {
  return {
    id: `a${Date.now().toString(36)}`,
    message: "",
    level: "info",
    active: true,
    startsOn: null,
    endsOn: null,
    linkUrl: "",
    linkLabel: "",
  };
}

function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Whether visitors see it today, and why not. */
function statusOf(item: Announcement, today: string): { label: string; tone: Tone; detail?: string } {
  if (!item.active) return { label: "Off", tone: "neutral" };
  if (!item.message.trim()) return { label: "Empty", tone: "warning", detail: "Add a message to show it" };
  if (item.startsOn && item.startsOn > today) return { label: "Scheduled", tone: "accent", detail: `Shows from ${formatDay(item.startsOn)}` };
  if (item.endsOn && item.endsOn < today) return { label: "Ended", tone: "neutral", detail: `Ended ${formatDay(item.endsOn)}` };
  return { label: "Live", tone: "success", detail: item.endsOn ? `Until ${formatDay(item.endsOn)}` : "No end date" };
}

/** The banner exactly as visitors see it (it reuses the public site's styles). */
function BannerPreview({ item }: { item: Announcement }) {
  return (
    <div className="adm-banner-preview" aria-label="Preview">
      <div className={`announcement level-${item.level}`} style={{ pointerEvents: "none" }}>
        <p>
          {item.message.trim() || <span className="adm-muted">Your message will appear here.</span>}
          {item.linkUrl ? (
            <>
              {" "}
              <a href={item.linkUrl} tabIndex={-1}>
                {item.linkLabel || "Read more"}
              </a>
            </>
          ) : null}
        </p>
        <button type="button" tabIndex={-1} aria-hidden="true">
          ×
        </button>
      </div>
    </div>
  );
}

export default function AnnouncementsPage() {
  const confirm = useConfirm();
  const today = todayIso();
  return (
    <DocumentEditor
      sectionKey="announcements"
      title="Announcements"
      noun="Announcements"
      description="Short notices shown above the map, such as a new forecast or a severe-weather warning. Visitors can close them."
      describeChange={(path, data) => {
        const [index, field] = path.split(".");
        const item = data[Number(index)];
        const name = item ? `“${item.message.slice(0, 28)}${item.message.length > 28 ? "…" : ""}”` : `Announcement ${Number(index) + 1}`;
        return field ? `${name} › ${field.replace(/([A-Z])/g, " $1").toLowerCase()}` : name;
      }}
    >
      {({ draft, setDraft }) => {
        const update = (index: number, change: Partial<Announcement>) =>
          setDraft((items) => items.map((item, i) => (i === index ? { ...item, ...change } : item)));
        const move = (index: number, by: number) =>
          setDraft((items) => {
            const next = [...items];
            const [item] = next.splice(index, 1);
            next.splice(index + by, 0, item);
            return next;
          });
        const add = () => setDraft((items) => [newAnnouncement(), ...items]);

        if (!draft.length) {
          return (
            <div className="adm-card">
              <EmptyState
                icon="megaphone"
                title="No announcements"
                action={
                  <Button variant="primary" icon="plus" onClick={add} data-testid="admin-add-announcement">
                    New announcement
                  </Button>
                }
              >
                Nothing is shown above the map. Add one to tell visitors about a new forecast, a warning or an event.
              </EmptyState>
            </div>
          );
        }

        return (
          <div className="adm-stack">
            <div className="adm-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <p className="adm-muted adm-small">
                {draft.filter((item) => statusOf(item, today).label === "Live").length} of {draft.length} showing now. They appear in this order.
              </p>
              <Button icon="plus" onClick={add} data-testid="admin-add-announcement">
                New announcement
              </Button>
            </div>
            {draft.map((item, index) => {
              const status = statusOf(item, today);
              return (
                <section className="adm-card" key={item.id} data-testid="admin-announcement" aria-label={`Announcement ${index + 1}`}>
                  <header className="adm-item-head">
                    <h2>
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                      <span className="adm-item-title">{item.message.trim() || "New announcement"}</span>
                    </h2>
                    <div className="adm-item-actions">
                      <Switch checked={item.active} onChange={(active) => update(index, { active })} label={item.active ? "On" : "Off"} />
                      <Menu
                        label={`Actions for announcement ${index + 1}`}
                        items={[
                          { label: "Move up", icon: "arrowUp", disabled: index === 0, onSelect: () => move(index, -1) },
                          { label: "Move down", icon: "arrowDown", disabled: index === draft.length - 1, onSelect: () => move(index, 1) },
                          {
                            label: "Delete announcement",
                            icon: "trash",
                            tone: "danger",
                            onSelect: async () => {
                              if (
                                await confirm({
                                  title: "Delete announcement?",
                                  description: "It is removed when you save. Earlier versions stay in History.",
                                  confirmLabel: "Delete announcement",
                                  tone: "danger",
                                })
                              ) {
                                setDraft((items) => items.filter((_, i) => i !== index));
                              }
                            },
                          },
                        ]}
                      />
                    </div>
                  </header>
                  <div className="adm-item-body adm-stack">
                    <TextArea
                      label="Message"
                      path={`${index}.message`}
                      value={item.message}
                      onChange={(message) => update(index, { message })}
                      maxLength={500}
                      rows={2}
                      placeholder="e.g. The new 46-day forecast is out. Check your district's advice."
                      help="One or two short sentences."
                    />
                    <Segmented label="Type" value={item.level} options={LEVELS} onChange={(level) => update(index, { level })} />
                    <div className="adm-cols">
                      <DateInput
                        label="Show from"
                        path={`${index}.startsOn`}
                        value={item.startsOn}
                        onChange={(startsOn) => update(index, { startsOn })}
                        help="Empty: from now."
                      />
                      <DateInput
                        label="Show until"
                        path={`${index}.endsOn`}
                        value={item.endsOn}
                        onChange={(endsOn) => update(index, { endsOn })}
                        help="Empty: no end date. Includes this day."
                      />
                    </div>
                    <div className="adm-cols">
                      <TextInput
                        label="Link"
                        optional
                        type="url"
                        path={`${index}.linkUrl`}
                        value={item.linkUrl}
                        placeholder="https://www.meteo.gov.gh/…"
                        onChange={(linkUrl) => update(index, { linkUrl })}
                      />
                      <TextInput
                        label="Link text"
                        optional
                        path={`${index}.linkLabel`}
                        value={item.linkLabel}
                        placeholder="Read more"
                        maxLength={60}
                        onChange={(linkLabel) => update(index, { linkLabel })}
                      />
                    </div>
                    <div className="adm-field">
                      <span className="adm-label">Preview</span>
                      <BannerPreview item={item} />
                      {status.detail ? <p className="adm-hint">{status.detail}</p> : null}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        );
      }}
    </DocumentEditor>
  );
}
