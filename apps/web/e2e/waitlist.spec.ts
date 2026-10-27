/**
 * M2-AP10: Founders waitlist. The e2e server has no waitlist secrets, so the
 * real API is off ("coming soon"); the "on" states run against a mocked API
 * in the browser (`page.route`). The full flow against the database is
 * covered by `lib/waitlist/waitlist.test.ts` (PGlite).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const TOKEN = "A".repeat(43);

async function mockCount(page: Page, body: unknown) {
  await page.route("**/api/waitlist/count", (route) => route.fulfill({ json: body }));
}

test.describe("waitlist switched off (no secrets)", () => {
  test("shows the price and 'coming soon' without form, counter or Turnstile", async ({ page }) => {
    const response = await page.goto("/de");
    const section = page.locator("#founders-waitlist");
    await expect(
      section.getByRole("heading", { name: "Sichere dir den Founders-Preis" }),
    ).toBeVisible();
    await expect(section.getByTestId("waitlist-coming-soon")).toHaveText(
      "Die Warteliste öffnet bald. Schau in ein paar Tagen wieder vorbei.",
    );
    await expect(section.getByRole("textbox")).toHaveCount(0);
    await expect(section.getByTestId("waitlist-count")).toHaveCount(0);
    expect(response?.headers()["content-security-policy"]).not.toContain(
      "challenges.cloudflare.com",
    );
    await expectNoAxeViolations(page);
  });

  test("the real API reports off and refuses sign-ups", async ({ request }) => {
    const count = await request.get("/api/waitlist/count");
    expect(await count.json()).toEqual({ enabled: false });
    const signup = await request.post("/api/waitlist", {
      data: { email: "a@example.com", locale: "de", consent: true },
    });
    expect(signup.status()).toBe(503);
    expect(await signup.json()).toEqual({ error: "disabled" });
    const confirm = await request.get(`/api/waitlist/confirm?token=${TOKEN}&lang=en`, {
      maxRedirects: 0,
    });
    expect(confirm.status()).toBe(303);
    expect(new URL(confirm.headers().location ?? "").pathname).toBe("/en/founders-waitlist/error");
    // No GET unsubscribe: link scanners must not unsubscribe anybody.
    expect((await request.get(`/api/waitlist/unsubscribe?token=${TOKEN}`)).status()).toBe(405);
  });

  test("the footer leads to the localized Founders page", async ({ page }) => {
    await page.goto("/de");
    await page.getByRole("contentinfo").getByRole("link", { name: "Founders-Warteliste" }).click();
    await expect(page).toHaveURL(/\/de\/founders-warteliste$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Founders-Warteliste");
    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/en\/founders-waitlist$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Founders waitlist");
  });
});

test.describe("waitlist switched on (mocked API)", () => {
  test("shows the counter, validates, and confirms the sign-up accessibly", async ({ page }) => {
    await mockCount(page, { enabled: true, confirmed: 42, seats: 300 });
    let body: Record<string, unknown> | null = null;
    await page.route("**/api/waitlist", async (route: Route) => {
      body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 202, json: { status: "pending" } });
    });

    await page.goto("/de/founders-warteliste");
    const section = page.locator("#founders-waitlist");
    await expect(section.getByTestId("waitlist-count")).toHaveText(
      "42 von 300 Founders-Plätzen vorgemerkt",
    );
    await expectNoAxeViolations(page);

    const email = section.getByRole("textbox", { name: "E-Mail-Adresse" });
    const consent = section.getByRole("checkbox", { name: /Ich bin einverstanden/ });
    await expect(
      consent.locator("xpath=..").getByRole("link", { name: "Datenschutzerklärung" }),
    ).toHaveAttribute("href", "/de/datenschutz");
    const submit = section.getByRole("button", { name: "Eintragen" });

    await submit.click();
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAccessibleDescription("Bitte gib eine gültige E-Mail-Adresse ein.");

    await email.fill("ada@example.com");
    await submit.click();
    await expect(consent).toBeFocused();
    await expect(consent).toHaveAccessibleDescription("Bitte bestätige die Einwilligung.");

    // Keyboard only: tick the box with the space bar and submit with Enter.
    await consent.press("Space");
    await email.press("Enter");
    const success = section.getByTestId("waitlist-success");
    await expect(success).toBeFocused();
    await expect(success).toContainText("Fast geschafft!");
    await expect(success).toContainText("48 Stunden");
    expect(body).toEqual({ email: "ada@example.com", locale: "de", consent: true });
    await expectNoAxeViolations(page);
  });

  test("announces API errors in an alert", async ({ page }) => {
    await mockCount(page, { enabled: true, confirmed: 0, seats: 300 });
    await page.route("**/api/waitlist", (route) =>
      route.fulfill({ status: 429, json: { error: "rate_limited" } }),
    );
    await page.goto("/en");
    const section = page.locator("#founders-waitlist");
    await section.getByRole("textbox", { name: "Email address" }).fill("bob@example.com");
    await section.getByRole("checkbox").check();
    await section.getByRole("button", { name: "Join the list" }).click();
    await expect(section.getByRole("alert")).toHaveText(
      "We are receiving a lot of sign-ups right now. Please try again later.",
    );
    await expect(section.getByRole("textbox", { name: "Email address" })).toHaveValue(
      "bob@example.com",
    );
  });

  test("shows a full counter honestly and hides an unknown count", async ({ page }) => {
    await mockCount(page, { enabled: true, confirmed: 312, seats: 300 });
    await page.goto("/en/founders-waitlist");
    await expect(page.getByTestId("waitlist-count")).toHaveText(
      "All 300 Founders spots are reserved. Join anyway in case someone drops out.",
    );
    await page.unroute("**/api/waitlist/count");
    await mockCount(page, { enabled: true, confirmed: null, seats: 300 });
    await page.reload();
    await expect(page.getByRole("button", { name: "Join the list" })).toBeVisible();
    await expect(page.getByTestId("waitlist-count")).toHaveCount(0);
  });
});

test.describe("result pages", () => {
  test("confirmation results are localized and not indexed", async ({ page }) => {
    for (const [path, title] of [
      ["/de/founders-warteliste/bestaetigt", "Du bist auf der Warteliste"],
      ["/de/founders-warteliste/link-ungueltig", "Dieser Link funktioniert nicht mehr"],
      ["/en/founders-waitlist/error", "That did not work"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, nofollow",
      );
    }
    await expectNoAxeViolations(page);
  });

  test("unsubscribes with the token from the fragment, then drops it from the URL", async ({
    page,
  }) => {
    let body: unknown = null;
    await page.route("**/api/waitlist/unsubscribe", async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ json: { status: "unsubscribed" } });
    });
    await page.goto(`/de/founders-warteliste/abmelden#token=${TOKEN}`);
    const button = page.getByRole("button", { name: "Jetzt abmelden" });
    await expect(button).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    await expectNoAxeViolations(page);
    await button.click();
    await expect(page.getByTestId("unsubscribe-status")).toHaveText(
      "Du bist abgemeldet. Wir haben deine E-Mail-Adresse gelöscht.",
    );
    expect(body).toEqual({ token: TOKEN });
  });

  test("explains a missing unsubscribe token", async ({ page }) => {
    await page.goto("/en/founders-waitlist/unsubscribe");
    await expect(page.getByTestId("unsubscribe-status")).toHaveText(
      "Open this page with the unsubscribe link in our email.",
    );
    await expect(page.getByRole("button", { name: "Unsubscribe now" })).toHaveCount(0);
  });
});
