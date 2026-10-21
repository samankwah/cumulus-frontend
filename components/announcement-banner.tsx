"use client";

import { useEffect, useState } from "react";

import { useSiteContent } from "@/lib/content/content-context";
import { currentAnnouncements } from "@/lib/content/site-content";
import type { Announcement } from "@/lib/content/site-content";
import { todayIso } from "@/lib/subseasonal";

const DISMISSED_KEY = "cumulus-dismissed-announcements";

/** An announcement is dismissed per wording, so an edited message shows again. */
function dismissKey(item: Announcement) {
  return `${item.id}:${item.message.length}:${item.message.slice(0, 40)}`;
}

function readDismissed(): string[] {
  try {
    return JSON.parse(window.sessionStorage.getItem(DISMISSED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/**
 * Announcements from the admin pages, above the map. Worked out in the browser (today's date,
 * what this visitor closed), so nothing shows until the page has loaded.
 */
export function AnnouncementBanner() {
  const { announcements } = useSiteContent();
  const [shown, setShown] = useState<Announcement[]>([]);

  useEffect(() => {
    const dismissed = readDismissed();
    setShown(currentAnnouncements(announcements, todayIso()).filter((item) => !dismissed.includes(dismissKey(item))));
  }, [announcements]);

  if (!shown.length) {
    return null;
  }
  return (
    <div className="announcements" role="region" aria-label="Announcements" data-testid="announcements">
      {shown.map((item) => (
        <div key={item.id} className={`announcement level-${item.level}`} role={item.level === "urgent" ? "alert" : "status"}>
          <p>
            {item.message}
            {item.linkUrl ? (
              <>
                {" "}
                <a href={item.linkUrl} target="_blank" rel="noreferrer">
                  {item.linkLabel || "Read more"}
                </a>
              </>
            ) : null}
          </p>
          <button
            type="button"
            aria-label="Close announcement"
            onClick={() => {
              try {
                window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...readDismissed(), dismissKey(item)]));
              } catch {
                // Not remembered; it closes for now anyway.
              }
              setShown((list) => list.filter((entry) => entry.id !== item.id));
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
