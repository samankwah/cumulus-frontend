/** Opens the Weather Skill panel from anywhere on the page, optionally with a ready question. */

export const ASK_EVENT = "cumulus:ask";

export type AskEventDetail = { prefill?: string };

export function openAsk(detail: AskEventDetail = {}) {
  window.dispatchEvent(new CustomEvent<AskEventDetail>(ASK_EVENT, { detail }));
}
