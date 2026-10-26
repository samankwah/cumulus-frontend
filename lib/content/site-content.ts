import { DEFAULT_ADVISORY_CONTENT } from "@/lib/content/advisory-content";
import type { AdvisoryContent } from "@/lib/content/advisory-content";

/* ------------------------------------------------------------------------------------------
 * The site's editable content: page text, announcements and the farm advisory. The values here
 * are the built-in defaults, used whenever no edited copy is available (no database configured,
 * the database unreachable, or a stored copy that fails validation).
 * ------------------------------------------------------------------------------------------ */

export type AnnouncementLevel = "info" | "warning" | "urgent";

export type Announcement = {
  id: string;
  message: string;
  level: AnnouncementLevel;
  /** Switched off announcements stay saved but are not shown. */
  active: boolean;
  /** First and last day to show it (YYYY-MM-DD, inclusive); null for no limit. */
  startsOn: string | null;
  endsOn: string | null;
  /** Optional "read more" link. */
  linkUrl: string;
  linkLabel: string;
};

export type SiteText = {
  /** Browser tab and search-result title. */
  title: string;
  /** Search-result description. */
  description: string;
  brandName: string;
  /** Heading of the 46-day view. */
  subseasonalHeading: string;
  /** Extra lines in the "About this data" panel. */
  dataInfo: {
    demoNote: string;
    gridNote: string;
    observedRainfall: string;
  };
  /** Shown in "About this data" when filled in. */
  about: {
    body: string;
    disclaimer: string;
    contactEmail: string;
    contactPhone: string;
  };
};

export type SiteContent = {
  site: SiteText;
  announcements: Announcement[];
  advisory: AdvisoryContent;
};

export const DEFAULT_SITE_TEXT: SiteText = {
  title: "Cumulus · Ghana Forecast Map",
  description: "Cumulus: Ghana's 46-day and seasonal rainfall forecasts and farm advice, by district.",
  brandName: "Cumulus",
  subseasonalHeading: "46-Day Forecast",
  dataInfo: {
    demoNote: "Demo data: a made-up ensemble for testing the views. Not a forecast.",
    gridNote: "about 11 km",
    observedRainfall:
      "IMERG late run (NASA GPM): satellite daily totals at 0.25°, matched to the forecast grid. Once a day has been observed (about two days later) it replaces the forecast in every member, so its chances read 0 or 100%; elapsed days still waiting for observations are hatched.",
  },
  about: {
    body: "",
    disclaimer: "",
    contactEmail: "",
    contactPhone: "",
  },
};

export const DEFAULT_SITE_CONTENT: SiteContent = {
  site: DEFAULT_SITE_TEXT,
  announcements: [],
  advisory: DEFAULT_ADVISORY_CONTENT,
};

/** Announcements to show on a date: switched on and inside their date range. */
export function currentAnnouncements(announcements: Announcement[], today: string) {
  return announcements.filter(
    (item) => item.active && item.message.trim() && (!item.startsOn || item.startsOn <= today) && (!item.endsOn || item.endsOn >= today),
  );
}
