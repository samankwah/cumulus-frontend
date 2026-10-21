import type { Metadata } from "next";

import { AnnouncementBanner } from "@/components/announcement-banner";
import { DashboardShell } from "@/components/dashboard-shell";
import { ContentProvider } from "@/lib/content/content-context";
import { getSiteContent } from "@/lib/content/get-content";

// Re-checked at least every 5 minutes; an admin save refreshes it straight away (see CONTENT_CACHE_TAG).
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { site } = await getSiteContent();
  return { title: site.title, description: site.description };
}

export default async function HomePage() {
  const content = await getSiteContent();
  return (
    <ContentProvider content={content}>
      <AnnouncementBanner />
      <DashboardShell />
    </ContentProvider>
  );
}
