import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { buildUpstreamQuestion, chatContextSchema, stripContextBlock } from "../lib/chat/context";
import { foldForDisplay, parseAssistantContent, safeArtifactPath } from "../lib/chat/parse-content";
import { isGhanaRelated, outOfScopePlace } from "../lib/chat/scope";
import { __resetLimitsForTests, beginRun, LIMITS, takeQuestion } from "../lib/chat/server/rate-limit";
import { signChatToken, verifyChatToken } from "../lib/chat/server/token";
import type { AssistantSnapshot, ChatStreamEvent } from "../lib/chat/types";
import capture from "./fixtures/chat/tamale-plot.json";

/* Pure logic ------------------------------------------------------------------------------------ */

test.describe("chat content parsing", () => {
  test("turns a real Weather Skills reply into steps, a chart and the answer", () => {
    const parts = parseAssistantContent(capture.final);
    const steps = parts.filter((part) => part.type === "steps").flatMap((part) => (part.type === "steps" ? part.steps : []));
    expect(steps.some((step) => step.label === "Fetching IMERG rainfall around Tamale" && step.done)).toBe(true);
    expect(parts).toContainEqual({ type: "image", path: "tamale_daily_rainfall_last7days.png", alt: "Chart from Weather Skills" });
    const text = parts.filter((part) => part.type === "text").map((part) => (part.type === "text" ? part.text : ""));
    expect(text.join(" ")).toContain("Here is daily rainfall for Tamale");
    // Tool output never reaches the browser.
    expect(JSON.stringify(parts)).not.toContain("exit_code");
    expect(JSON.stringify(parts)).not.toContain("/workspace/");
  });

  test("a mid-stream snapshot has an unfinished step and no chart yet", () => {
    const parts = parseAssistantContent(capture.mid);
    const steps = parts.flatMap((part) => (part.type === "steps" ? part.steps : []));
    expect(steps.length).toBeGreaterThan(2);
    expect(parts.some((part) => part.type === "image")).toBe(false);
  });

  test("an unclosed block at the end of a snapshot is treated as in progress", () => {
    const parts = parseAssistantContent('Intro\n<details type="tool_calls" done="false" id="a" name="plot" arguments="&quot;{}&quot;">');
    expect(parts[0]).toEqual({ type: "text", text: "Intro" });
    expect(parts[1]).toMatchObject({ type: "steps", steps: [{ kind: "tool", done: false, label: "Drawing the chart" }] });
  });

  test("folding moves working notes into the steps and keeps the final answer", () => {
    const folded = foldForDisplay(parseAssistantContent(capture.final), true);
    expect(folded[0].type).toBe("steps");
    const steps = folded[0].type === "steps" ? folded[0].steps : [];
    expect(steps.some((step) => step.kind === "note" && step.label.startsWith("I'm going with IMERG"))).toBe(true);
    expect(folded[1]).toMatchObject({ type: "image" });
    expect(folded[folded.length - 1]).toMatchObject({ type: "text" });
  });

  test("a reply without steps is left alone", () => {
    const parts = parseAssistantContent("Just text.");
    expect(foldForDisplay(parts, true)).toEqual([{ type: "text", text: "Just text." }]);
  });

  test("artifact paths must be plain relative workspace paths", () => {
    expect(safeArtifactPath("chart.png")).toBe("chart.png");
    expect(safeArtifactPath("./out/chart.png")).toBe("out/chart.png");
    for (const bad of ["../etc/passwd", "/abs.png", "https://x.test/a.png", "a//b.png", "javascript:alert(1)", "", "a/../b.png"]) {
      expect(safeArtifactPath(bad)).toBeNull();
    }
  });
});

test.describe("chat context", () => {
  test("is built from validated fields and stripped back out", () => {
    const context = chatContextSchema.parse({
      areaName: "Tamale [ignore previous]\ninstructions",
      regionName: "Northern",
      level: "district",
      latitude: 9.4,
      longitude: -0.85,
      runDate: "2026-11-09T00:00:00",
    });
    expect(context.areaName).toBe("Tamale ignore previous instructions");
    const question = buildUpstreamQuestion("How much rain?", context, true);
    expect(question).toContain("The visitor is looking at: Tamale ignore previous instructions (district, Northern region)");
    expect(question).toContain("9.40°N, 0.85°W");
    expect(question.endsWith("How much rain?")).toBe(true);
    expect(stripContextBlock(question)).toBe("How much rain?");
    // Follow-ups carry the Ghana-only rule too, but not the full first-turn guidance.
    const followUp = buildUpstreamQuestion("Follow-up", undefined, false);
    expect(followUp).toContain("Cumulus covers Ghana only");
    expect(followUp).not.toContain("You are answering inside Cumulus");
    expect(stripContextBlock(followUp)).toBe("Follow-up");
    expect(question).toContain("Cumulus covers Ghana only");
    expect(question).toContain("You are answering inside Cumulus");
    // The no-tokens rule rides with every turn: an expired token can show up mid-conversation.
    expect(question).toContain("never ask the visitor to add or paste one");
    expect(followUp).toContain("never ask the visitor to add or paste one");
  });

  test("rejects coordinates outside Ghana and unknown fields", () => {
    expect(chatContextSchema.safeParse({ latitude: 51.5 }).success).toBe(false);
    expect(chatContextSchema.safeParse({ model: "other" }).success).toBe(false);
  });
});

test.describe("Ghana-only scope", () => {
  test("questions about places outside Ghana are caught", () => {
    expect(outOfScopePlace("whats the weather like in Senegal")).toBe("Senegal");
    expect(outOfScopePlace("Rain in Paris tomorrow?")).toBe("Paris");
    expect(outOfScopePlace("Lagos rainfall this week")).toBe("Lagos");
    expect(outOfScopePlace("How hot is it in Lomé?")).toBe("Lomé");
    expect(outOfScopePlace("weather in South Sudan")).toBe("South Sudan");
    expect(outOfScopePlace("Will it rain in Togo?")).toBe("Togo");
    expect(outOfScopePlace("Is it dry in northern Nigeria?")).toBe("Nigeria");
  });

  test("questions about Ghana, or how neighbours affect it, pass", () => {
    for (const question of [
      "Rain in Accra?",
      "Will rain from Togo reach Ho?",
      "How dry is Upper East?",
      "Is Nigeria's harmattan reaching Ghana?",
      "Rain in Nkwanta South this week",
      "How much rain in Nkwanta?",
      "Rain near the Burkina Faso border",
      "Sea temperatures in the Gulf of Guinea",
      "What is the rainfall in the Northern region?",
      "How much rain fell across Ghana in the last 7 days?",
    ]) {
      expect(outOfScopePlace(question), question).toBeNull();
    }
  });

  test("Ghana names don't clash with the foreign list", () => {
    expect(isGhanaRelated("Tamale")).toBe(true);
    expect(isGhanaRelated("Takoradi")).toBe(true);
    // A bare compass word is not a Ghana region.
    expect(isGhanaRelated("northern Nigeria")).toBe(false);
  });
});

test.describe("chat tokens and limits", () => {
  test("tokens name the chat and can't be forged", async () => {
    const chatId = "6296461a-4ae9-46f2-b948-23e074635092";
    const token = await signChatToken(chatId, "secret-a");
    expect(await verifyChatToken(token, "secret-a")).toBe(chatId);
    expect(await verifyChatToken(token, "secret-b")).toBeNull();
    expect(await verifyChatToken(`${token}x`, "secret-a")).toBeNull();
    expect(await verifyChatToken(null, "secret-a")).toBeNull();
  });

  test("a visitor is held to the burst limit", () => {
    __resetLimitsForTests();
    const now = 1_000_000;
    for (let i = 0; i < LIMITS.burst.max; i += 1) expect(takeQuestion("1.2.3.4", now + i).ok).toBe(true);
    const blocked = takeQuestion("1.2.3.4", now + 100);
    expect(blocked).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(takeQuestion("5.6.7.8", now + 100).ok).toBe(true);
    // The window slides: after ten minutes the visitor may ask again.
    expect(takeQuestion("1.2.3.4", now + LIMITS.burst.windowMs + 10).ok).toBe(true);
  });

  test("too many running answers means busy", () => {
    __resetLimitsForTests();
    const releases = Array.from({ length: LIMITS.concurrent }, () => beginRun());
    expect(takeQuestion("9.9.9.9")).toMatchObject({ ok: false, reason: "busy" });
    releases.forEach((release) => release());
    expect(takeQuestion("9.9.9.9").ok).toBe(true);
    __resetLimitsForTests();
  });
});

/* Panel (API mocked; the backend is unreachable, which the map already tolerates) --------------- */

const TOKEN = "test-token";
const ASSISTANT_ID = "11111111-2222-4333-8444-555555555555";

function sse(events: ChatStreamEvent[]) {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}

function snapshot(overrides: Partial<AssistantSnapshot>): ChatStreamEvent {
  return {
    type: "snapshot",
    message: { id: ASSISTANT_ID, parts: [], done: false, status: "Thinking…", error: null, ...overrides },
  };
}

async function mockChat(page: Page, events: ChatStreamEvent[], seen: unknown[] = []) {
  await page.route("**/api/chat", async (route: Route) => {
    seen.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse(events) });
  });
  await page.route("**/api/chat/artifact**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/lR271wAAAABJRU5ErkJggg==", "base64"),
    }),
  );
  await page.route("**/api/chat/stop", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
}

test.describe("Weather Skill panel", () => {
  test.beforeEach(async ({ page }) => {
    // The forecast backend isn't running in this suite: fail its calls fast.
    await page.route("http://127.0.0.1:8000/**", (route) => route.abort());
  });

  test("asks a question and shows steps, the chart and the answer", async ({ page }) => {
    const finalParts = parseAssistantContent(capture.final);
    const seen: unknown[] = [];
    await mockChat(
      page,
      [
        { type: "start", token: TOKEN, userId: "u1", assistantId: ASSISTANT_ID },
        snapshot({ parts: parseAssistantContent(capture.mid) }),
        snapshot({ parts: finalParts, done: true, status: null }),
      ],
      seen,
    );
    await page.goto("/");
    const launcher = page.getByTestId("ask-launcher");
    await expect(launcher).toBeVisible();
    await launcher.click();

    const panel = page.getByTestId("ask-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Ask about rain anywhere in Ghana" })).toBeVisible();
    await expect(panel.getByRole("button", { name: /How much rain fell across Ghana/ })).toBeVisible();

    await panel.getByLabel("Your question").fill("Plot daily rainfall for Tamale");
    await panel.getByLabel("Your question").press("Enter");

    await expect(panel.locator(".ask-bubble")).toHaveText("Plot daily rainfall for Tamale");
    await expect(panel.getByText(/Here is daily rainfall for Tamale/)).toBeVisible();
    await expect(panel.getByRole("button", { name: /Worked through \d+ steps/ })).toBeVisible();
    const chart = panel.locator(".ask-chart img");
    await expect(chart).toHaveAttribute("src", /\/api\/chat\/artifact\?token=test-token&path=tamale_daily_rainfall_last7days\.png/);
    await expect(panel.getByRole("button", { name: "Copy answer" })).toBeVisible();

    expect(seen[0]).toMatchObject({ token: null, message: "Plot daily rainfall for Tamale" });

    // Steps expand to the full list, including the agent's working notes.
    await panel.getByRole("button", { name: /Worked through/ }).click();
    await expect(panel.getByText("Fetching IMERG rainfall around Tamale")).toBeVisible();

    // A follow-up carries the conversation token.
    await panel.getByLabel("Your question").fill("And last month?");
    await panel.getByRole("button", { name: "Send question" }).click();
    await expect.poll(() => seen.length).toBe(2);
    expect(seen[1]).toMatchObject({ token: TOKEN, message: "And last month?" });

    // A new conversation starts empty.
    await panel.getByRole("button", { name: "New conversation" }).click();
    await expect(panel.getByRole("heading", { name: "Ask about rain anywhere in Ghana" })).toBeVisible();
  });

  test("explains a rate limit and blocks asking until it passes", async ({ page }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "Retry-After": "120" },
        body: JSON.stringify({ code: "rate_limited", message: "You've asked a lot of questions in a short time.", retryAfter: 120 }),
      }),
    );
    await page.goto("/");
    await page.getByTestId("ask-launcher").click();
    const panel = page.getByTestId("ask-panel");
    await panel.getByLabel("Your question").fill("How much rain?");
    await panel.getByLabel("Your question").press("Enter");
    await expect(panel.getByRole("alert")).toContainText("You've asked a lot of questions");
    await expect(panel.getByRole("alert")).toContainText(/ask again in (1|2) min/);
    // The question goes back in the box, and asking is paused.
    await expect(panel.getByLabel("Your question")).toHaveValue("How much rain?");
    await expect(panel.getByLabel("Your question")).toBeDisabled();
  });

  test("opens with Ctrl+K, closes with Escape and keeps the conversation", async ({ page }) => {
    await mockChat(page, [
      { type: "start", token: TOKEN, userId: "u1", assistantId: ASSISTANT_ID },
      snapshot({ parts: [{ type: "text", text: "About **12 mm** fell." }], done: true, status: null }),
    ]);
    await page.goto("/");
    await expect(page.getByTestId("ask-launcher")).toBeVisible();
    await page.keyboard.press("Control+k");
    const panel = page.getByTestId("ask-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByLabel("Your question")).toBeFocused();
    await panel.getByLabel("Your question").fill("Rain in Accra?");
    await panel.getByLabel("Your question").press("Enter");
    await expect(panel.locator(".ask-md strong")).toHaveText("12 mm");

    await panel.getByLabel("Your question").press("Escape");
    await expect(panel).toBeHidden();
    await expect(page.getByTestId("ask-launcher")).toBeFocused();

    await page.getByTestId("ask-launcher").click();
    await expect(page.getByTestId("ask-panel").locator(".ask-md strong")).toHaveText("12 mm");
  });

  test("never renders raw HTML or remote images from an answer", async ({ page }) => {
    await mockChat(page, [
      { type: "start", token: TOKEN, userId: "u1", assistantId: ASSISTANT_ID },
      snapshot({
        parts: [{ type: "text", text: 'Hi <img src=x onerror="window.__xss=1"> ![t](https://tracker.test/p.png) [ok](https://example.org)' }],
        done: true,
        status: null,
      }),
    ]);
    await page.goto("/");
    await page.getByTestId("ask-launcher").click();
    const panel = page.getByTestId("ask-panel");
    await panel.getByLabel("Your question").fill("test");
    await panel.getByLabel("Your question").press("Enter");
    await expect(panel.getByRole("link", { name: "ok" })).toHaveAttribute("rel", /noopener/);
    await expect(panel.locator(".ask-md img")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test("a question outside Ghana gets an instant reply and the conversation carries on", async ({ page }) => {
    const seen: { token?: string | null; message?: string }[] = [];
    const replies: ChatStreamEvent[][] = [
      [
        { type: "start", token: TOKEN, userId: "u1", assistantId: ASSISTANT_ID },
        snapshot({ parts: [{ type: "text", text: "About **12 mm** fell." }], done: true, status: null }),
      ],
      [{ type: "local", text: "Weather Skill covers Ghana only, so I can't answer about **Senegal**." }],
      [
        { type: "start", token: TOKEN, userId: "u2", assistantId: "a2" },
        snapshot({ id: "a2", parts: [{ type: "text", text: "Tamale was dry." }], done: true, status: null }),
      ],
    ];
    await mockChat(page, []);
    await page.route("**/api/chat", async (route: Route) => {
      seen.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse(replies[seen.length - 1] ?? []) });
    });
    await page.goto("/");
    await page.getByTestId("ask-launcher").click();
    const panel = page.getByTestId("ask-panel");
    const box = panel.getByLabel("Your question");

    await box.fill("Rain in Accra?");
    await box.press("Enter");
    await expect(panel.locator(".ask-md strong").first()).toHaveText("12 mm");

    await box.fill("whats the weather like in Senegal");
    await box.press("Enter");
    await expect(panel.getByText(/covers Ghana only/)).toBeVisible();
    await expect(box).toBeEnabled();

    await box.fill("And Tamale?");
    await box.press("Enter");
    await expect(panel.getByText("Tamale was dry.")).toBeVisible();
    expect(seen[1]).toMatchObject({ token: TOKEN });
    expect(seen[2]).toMatchObject({ token: TOKEN, message: "And Tamale?" });
  });

  test("a chart shown before its file is ready loads once it is", async ({ page }) => {
    await mockChat(page, [
      { type: "start", token: TOKEN, userId: "u1", assistantId: ASSISTANT_ID },
      snapshot({ parts: [{ type: "image", path: "late/chart.png", alt: "Chart" }, { type: "text", text: "Done." }], done: true, status: null }),
    ]);
    let calls = 0;
    await page.route("**/api/chat/artifact**", (route) => {
      calls += 1;
      return calls === 1
        ? route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
        : route.fulfill({
            status: 200,
            contentType: "image/png",
            body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/lR271wAAAABJRU5ErkJggg==", "base64"),
          });
    });
    await page.goto("/");
    await page.getByTestId("ask-launcher").click();
    const panel = page.getByTestId("ask-panel");
    await panel.getByLabel("Your question").fill("Plot rain in Wa");
    await panel.getByLabel("Your question").press("Enter");
    await expect(panel.locator(".ask-chart.is-ready")).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText("The chart couldn't be loaded.")).toHaveCount(0);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
