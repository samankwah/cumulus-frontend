import { z } from "zod";

import type { ChatContext } from "./types";

/**
 * Weather Skills ignores a per-request system prompt, so Cumulus' guidance travels as a marked
 * block in front of the visitor's question. The block is built on the server from validated
 * fields only, and stripped again before a stored question is shown back to the visitor.
 */

const OPEN = "[Cumulus context]";
const CLOSE = "[/Cumulus context]";

const safeText = (max: number) =>
  z
    .string()
    .max(200)
    .transform((value) => value.replace(/[\[\]\r\n<>`]/g, " ").replace(/\s+/g, " ").trim().slice(0, max))
    .optional();

export const chatContextSchema = z
  .object({
    areaName: safeText(80),
    regionName: safeText(80),
    level: z.enum(["district", "region"]).optional(),
    // Ghana and its neighbours, generously.
    latitude: z.number().min(2).max(14).optional(),
    longitude: z.number().min(-6).max(4).optional(),
    runDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/)
      .transform((value) => value.slice(0, 10))
      .optional(),
    modelLabel: safeText(60),
    layerLabel: safeText(60),
  })
  .strict();

function describe(context: ChatContext | undefined): string | null {
  if (!context) return null;
  const bits: string[] = [];
  if (context.areaName) {
    const level = context.level ? `${context.level}` : "area";
    const region = context.regionName && context.regionName !== context.areaName ? `, ${context.regionName} region` : "";
    bits.push(`${context.areaName} (${level}${region})`);
  }
  if (context.latitude !== undefined && context.longitude !== undefined) {
    const lat = `${Math.abs(context.latitude).toFixed(2)}°${context.latitude >= 0 ? "N" : "S"}`;
    const lon = `${Math.abs(context.longitude).toFixed(2)}°${context.longitude >= 0 ? "E" : "W"}`;
    bits.push(context.areaName ? `centre ${lat}, ${lon}` : `the point ${lat}, ${lon}`);
  }
  if (context.runDate) {
    bits.push(`Cumulus forecast run of ${context.runDate}${context.modelLabel ? ` (${context.modelLabel} model)` : ""}`);
  }
  if (context.layerLabel) bits.push(`map layer "${context.layerLabel}"`);
  return bits.length ? `The visitor is looking at: ${bits.join("; ")}.` : null;
}

const GUIDANCE = [
  "You are answering inside Cumulus, Ghana's sub-seasonal rainfall forecast website. Visitors include farmers, agricultural extension officers and forecasters.",
  "Write plain English first, in short paragraphs or bullets that read well on a phone, and say briefly what the result means for the visitor. Give technical detail (sources, resolution, methods) in a sentence or two, or more only when asked.",
  "When a sensible default exists, go ahead with it and say which default you chose instead of asking to confirm.",
  "Use sources that cover Ghana well (IMERG, CHIRPS, RFE2, TAHMO, ECMWF) and use Ghanaian place names.",
  "If the visitor names no place, use the place they are looking at, if given.",
  "Name data sources in plain words (for example \"NASA IMERG satellite rainfall\"), not internal skill or tool names, unless the visitor asks how it was done.",
].join(" ");

/** Sent with every question, not only the first: follow-ups must stay in scope too. */
const SCOPE = [
  "Cumulus covers Ghana only. Answer only about weather, climate and farming in Ghana.",
  "Mention neighbouring countries only for how they affect Ghana (for example rain moving in from Togo, or harmattan dust).",
  "If the question is about somewhere else or something unrelated, do not fetch data or run any tools: reply in one or two sentences that Weather Skill covers Ghana only, and suggest a similar question about a place in Ghana.",
  // Visitors are the public: they can't fix a missing or expired token, and must never see the workspace's settings.
  "If a data source fails or needs a token, key, secret or other setup you don't have, never ask the visitor to add or paste one and never link to workspace, settings or secrets pages. Say briefly that this forecast can't be loaded in chat right now and that the visitor can see it on the Cumulus map. If you answer from another source instead, name that source plainly.",
].join(" ");

/** The text actually sent upstream for one question. */
export function buildUpstreamQuestion(question: string, context: ChatContext | undefined, firstTurn: boolean): string {
  const looking = describe(context);
  const lines = firstTurn ? [GUIDANCE, SCOPE, looking] : [SCOPE, looking];
  const body = lines.filter(Boolean).join("\n");
  return body ? `${OPEN}\n${body}\n${CLOSE}\n\n${question}` : question;
}

/** Removes the context block from a stored question. */
export function stripContextBlock(text: string): string {
  const start = text.indexOf(OPEN);
  if (start !== 0) return text;
  const end = text.indexOf(CLOSE);
  return end === -1 ? text : text.slice(end + CLOSE.length).trimStart();
}
