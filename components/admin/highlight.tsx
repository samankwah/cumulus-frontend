import { Fragment } from "react";

import type { MessageVars } from "@/lib/content/advisory-messages";

/**
 * A template filled in like fillTemplate, with each inserted value wrapped in <mark> so editors
 * can see which words came from a placeholder. Unknown placeholders stay as written.
 */
export function HighlightedTemplate({ template, vars }: { template: string; vars: MessageVars }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of template.matchAll(/\{([A-Za-z]+)\}/g)) {
    const [whole, name] = match;
    const index = match.index ?? 0;
    parts.push(template.slice(last, index));
    const lower = name.charAt(0).toLowerCase() + name.slice(1);
    if (name in vars) {
      parts.push(<mark key={index}>{String(vars[name])}</mark>);
    } else if (lower !== name && lower in vars) {
      const value = String(vars[lower]);
      parts.push(<mark key={index}>{value.charAt(0).toUpperCase() + value.slice(1)}</mark>);
    } else {
      parts.push(
        <mark key={index} className="unknown">
          {whole}
        </mark>,
      );
    }
    last = index + whole.length;
  }
  parts.push(template.slice(last));
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>{part}</Fragment>
      ))}
    </>
  );
}
