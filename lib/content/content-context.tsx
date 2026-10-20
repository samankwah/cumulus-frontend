"use client";

import { createContext, useContext } from "react";

import { DEFAULT_SITE_CONTENT } from "@/lib/content/site-content";
import type { SiteContent } from "@/lib/content/site-content";

const ContentContext = createContext<SiteContent>(DEFAULT_SITE_CONTENT);

/** Hands the content loaded on the server to the client components; without it they use the defaults. */
export function ContentProvider({ content, children }: { content: SiteContent; children: React.ReactNode }) {
  return <ContentContext.Provider value={content}>{children}</ContentContext.Provider>;
}

export function useSiteContent() {
  return useContext(ContentContext);
}
