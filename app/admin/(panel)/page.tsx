import Link from "next/link";

import { Icon } from "@/components/admin/icons";
import type { IconName } from "@/components/admin/icons";
import { Badge, PageHeader, RelativeTime } from "@/components/admin/ui";
import { initials } from "@/lib/admin/initials";
import { currentUser } from "@/lib/auth/users";
import { CONTENT_DOCUMENTS, validateDocument } from "@/lib/content/documents";
import type { ContentKey } from "@/lib/content/documents";
import { listDocuments, recentActivity } from "@/lib/content/store";
import { currentAnnouncements } from "@/lib/content/site-content";
import type { Announcement } from "@/lib/content/site-content";

const SECTIONS: { key: ContentKey; href: string; icon: IconName; about: string }[] = [
  { key: "announcements", href: "/admin/announcements", icon: "megaphone", about: "Notices shown above the map, like a new forecast or a warning." },
  { key: "messages", href: "/admin/messages", icon: "message", about: "Every sentence of the farm advisory." },
  { key: "crops", href: "/admin/crops", icon: "sprout", about: "The crop picker and the words used for each crop." },
  { key: "thresholds", href: "/admin/thresholds", icon: "gauge", about: "Planting rain, end of rains, heavy rain and spray windows." },
  { key: "seasons", href: "/admin/seasons", icon: "calendar", about: "Which season and crop stage applies on each date." },
  { key: "regions", href: "/admin/regions", icon: "map", about: "Where the northern sector and transition zone begin." },
  { key: "labels", href: "/admin/labels", icon: "tag", about: "Group headings and confidence tags in the advisory." },
  { key: "site", href: "/admin/site", icon: "text", about: "Page title, heading, About, disclaimer and contact." },
  { key: "forecast", href: "/admin/forecast", icon: "cloud", about: "The model GMet issues: district bulletins and the partner API." },
];

function greeting() {
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Accra" }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function AdminHome() {
  const [user, documents, activity] = await Promise.all([currentUser(), listDocuments(), recentActivity(8)]);
  const today = new Date().toISOString().slice(0, 10);
  const announcementsDoc = documents.find((doc) => doc.key === "announcements");
  const announcements = (announcementsDoc?.data as Announcement[] | null) ?? [];
  const live = currentAnnouncements(announcements, today).length;
  const firstName = user?.name.split(/\s+/)[0] ?? "";
  const customised = documents.filter((doc) => doc.data !== null).length;

  return (
    <>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        description="Choose what to edit. Saved changes reach the public site within a minute, and every save is kept in History, so any change can be undone."
        actions={
          <Link className="adm-btn adm-btn-primary adm-btn-md" href="/admin/announcements">
            <Icon name="plus" size={17} />
            New announcement
          </Link>
        }
      />
      <div className="adm-overview">
        <section aria-labelledby="sections-title">
          <h2 className="adm-group-title" id="sections-title">
            Content
          </h2>
          <div className="adm-tiles">
            {SECTIONS.map((section) => {
              const document = documents.find((doc) => doc.key === section.key);
              const edited = Boolean(document && document.data !== null);
              const invalid = edited && !validateDocument(section.key, document?.data).success;
              return (
                <Link key={section.key} href={section.href} className="adm-card adm-tile">
                  <div className="adm-tile-top">
                    <span className="adm-tile-icon">
                      <Icon name={section.icon} size={18} />
                    </span>
                    <h3>{CONTENT_DOCUMENTS[section.key].title}</h3>
                  </div>
                  <p>{section.about}</p>
                  <div className="adm-tile-foot">
                    {invalid ? (
                      <Badge tone="danger" dot>
                        Needs fixing
                      </Badge>
                    ) : section.key === "announcements" ? (
                      live ? (
                        <Badge tone="success" dot>
                          {live} live now
                        </Badge>
                      ) : (
                        <Badge>None showing</Badge>
                      )
                    ) : edited ? (
                      <Badge tone="accent" dot>
                        Customised
                      </Badge>
                    ) : (
                      <Badge>Default content</Badge>
                    )}
                    {edited && document?.updatedAt ? (
                      <span>
                        <RelativeTime iso={document.updatedAt} />
                      </span>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
        <aside aria-labelledby="activity-title">
          <h2 className="adm-group-title" id="activity-title">
            Recent changes
          </h2>
          <div className="adm-card">
            {activity.length ? (
              <ul className="adm-list adm-activity">
                {activity.map((item) => (
                  <li key={`${item.key}-${item.version}`}>
                    <span className="adm-avatar" aria-hidden="true">
                      {initials(item.updatedBy)}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block" }}>
                        <strong>{item.updatedBy}</strong> {item.isDefault ? "reset" : "edited"}{" "}
                        <Link href={SECTIONS.find((section) => section.key === item.key)?.href ?? "/admin"}>
                          {CONTENT_DOCUMENTS[item.key].title.toLowerCase()}
                        </Link>
                      </span>
                      <span className="adm-muted adm-small">
                        <RelativeTime iso={item.createdAt} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adm-muted" style={{ padding: "18px 20px" }}>
                No changes yet. Everything shows the built-in content.
              </p>
            )}
          </div>
          <p className="adm-hint" style={{ marginTop: 12 }}>
            {customised ? `${customised} of ${documents.length} sections customised.` : "All sections use the built-in content."}
          </p>
        </aside>
      </div>
    </>
  );
}
