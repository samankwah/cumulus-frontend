"use client";

import { memo } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { safeArtifactPath } from "@/lib/chat/parse-content";

/**
 * Renders the assistant's markdown safely: raw HTML is never rendered (react-markdown escapes it),
 * relative links point at files in the visitor's conversation and go through our proxy, and
 * external links open in a new tab without referrer.
 */

export function artifactUrl(token: string | null, path: string) {
  return token ? `/api/chat/artifact?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}` : null;
}

function Markdown({ text, token }: { text: string; token: string | null }) {
  const transform = (url: string) => {
    const artifact = safeArtifactPath(url);
    if (artifact) return artifactUrl(token, artifact) ?? "";
    return defaultUrlTransform(url);
  };

  const components: Components = {
    a({ href, children }) {
      const isLocal = typeof href === "string" && href.startsWith("/api/chat/artifact");
      if (!href) return <span>{children}</span>;
      return isLocal ? (
        <a href={href} download>
          {children}
        </a>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow">
          {children}
        </a>
      );
    },
    img({ src, alt }) {
      // Only charts from the conversation itself; remote images could track visitors.
      if (typeof src !== "string" || !src.startsWith("/api/chat/artifact")) return null;
      // eslint-disable-next-line @next/next/no-img-element
      return <img className="ask-md-img" src={src} alt={alt ?? "Chart"} loading="lazy" />;
    },
    table({ children }) {
      return (
        <div className="ask-table-wrap" tabIndex={0}>
          <table>{children}</table>
        </div>
      );
    },
  };

  return (
    <div className="ask-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={transform} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
