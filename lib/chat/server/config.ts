/**
 * Server-only settings for the Weather Skills assistant. Nothing here may be imported by a
 * client component: the key must never reach the browser bundle.
 */

export type ChatConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /**
   * Weather Skills workspace (organisation) the chats run in. The key reaches every workspace the
   * user belongs to; without this they land in Personal, which lacks the Cumulus skill and its token.
   */
  organizationId?: string;
  /** Secret used to sign conversation tokens handed to visitors. */
  tokenSecret: string;
};

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

/** null when the assistant is switched off or not configured; the routes then answer 503. */
export function getChatConfig(): ChatConfig | null {
  if ((process.env.WEATHER_SKILLS_CHAT ?? "on").toLowerCase() === "off") {
    return null;
  }
  const apiKey = process.env.WEATHER_SKILLS_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const baseUrl = trimSlash(process.env.WEATHER_SKILLS_URL?.trim() || "https://chat.weather-skills.org");
  return {
    baseUrl,
    apiKey,
    model: process.env.WEATHER_SKILLS_MODEL?.trim() || "weather-agent",
    organizationId: process.env.WEATHER_SKILLS_ORG_ID?.trim() || undefined,
    // A dedicated secret is preferred; falling back to the key keeps tokens unforgeable without it.
    tokenSecret: process.env.CHAT_TOKEN_SECRET?.trim() || `cumulus-chat:${apiKey}`,
  };
}
