/**
 * M2-AP09: home page, footer, legal pages (draft state) and telemetry being
 * off without its environment variables (the e2e server never sets them).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const THIRD_PARTY = /cloudflareinsights\.com|sentry\.io/;

test.describe("home page", () => {
  test("shows hero, categories, featured tools, steps, FAQ and CTA", async ({ page }) => {
    await page.goto("/en");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("Motifs in one click");
    for (const name of [
      "Why Motivo",
      "Tools by category",
      "Popular generators",
      "How it works",
      "Frequently asked questions",
      "Ready for your first motif?",
    ]) {
      await expect(main.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    // Hero motifs come from the tools' own static renders.
    const showcase = main.getByRole("list", { name: "Sample motifs" });
    await expect(showcase.locator('img[src^="/motifs/"]')).toHaveCount(3);
    await expect(showcase.locator("img").first()).toHaveJSProperty("complete", true);

    await main.getByRole("link", { name: "Explore all tools" }).click();
    await expect(page).toHaveURL(/\/en\/tools$/);
  });

  test("links categories and the start tool in German", async ({ page }) => {
    await page.goto("/de");
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: /^Farben/ })).toHaveAttribute(
      "href",
      "/de/tools/kategorie/farben",
    );
    await expect(main.getByRole("link", { name: "Mit CSS-Verlauf starten" })).toHaveAttribute(
      "href",
      "/de/tools/css-verlauf-generator",
    );
  });

  test("states no binding price or offer", async ({ page }) => {
    await page.goto("/de");
    const text = (await page.getByRole("main").textContent()) ?? "";
    expect(text).not.toMatch(/CHF|EUR|USD|€|\$/);
    expect(text).toContain("Lifetime-Lizenz");
  });
});

test.describe("footer and legal pages", () => {
  test("footer links lead to the localized legal pages", async ({ page }) => {
    await page.goto("/de");
    const footer = page.getByRole("contentinfo");
    await footer.getByRole("link", { name: "Impressum" }).click();
    await expect(page).toHaveURL(/\/de\/impressum$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Impressum");

    await page.getByRole("contentinfo").getByRole("link", { name: "Datenschutz" }).click();
    await expect(page).toHaveURL(/\/de\/datenschutz$/);

    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/en\/privacy$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy policy");
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Imprint" }),
    ).toHaveAttribute("href", "/en/imprint");
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "All tools" }),
    ).toBeVisible();
  });

  test("foreign legal slugs redirect", async ({ page }) => {
    await page.goto("/en/datenschutz");
    await expect(page).toHaveURL(/\/en\/privacy$/);
    await page.goto("/de/imprint");
    await expect(page).toHaveURL(/\/de\/impressum$/);
  });

  for (const path of ["/de/impressum", "/en/imprint", "/de/datenschutz", "/en/privacy"]) {
    test(`${path} is a noindex draft with the operator placeholders`, async ({ page }) => {
      await page.goto(path);
      const banner = page.getByTestId("legal-draft-banner");
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(
        path.startsWith("/de") ? "Entwurf, juristisch zu prüfen" : "Draft, pending legal review",
      );
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.getByTestId("legal-operator")).toContainText("[Name]");
      await expect(page.getByTestId("legal-operator")).toContainText("[E-Mail]");
    });
  }

  test("the privacy policy covers hosting, analytics, errors and local processing", async ({
    page,
  }) => {
    await page.goto("/en/privacy");
    const main = page.getByRole("main");
    for (const name of [
      "Hosting with Cloudflare",
      "Statistics with Cloudflare Web Analytics",
      "Error reports with Sentry",
      "No cookies, only local settings",
      "Images stay in your browser",
      "Share links",
      "Your rights",
    ]) {
      await expect(main.getByRole("heading", { level: 2, name })).toBeVisible();
    }
  });
});

test.describe("accessibility of home and legal pages", () => {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`${scheme} theme`, () => {
      test.use({ colorScheme: scheme });
      for (const path of ["/de/impressum", "/en/imprint", "/de/datenschutz", "/en/privacy"]) {
        test(`${path} has no axe violations`, async ({ page }) => {
          await page.goto(path);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await expectNoAxeViolations(page);
        });
      }
    });
  }

  test("home page is keyboard navigable to the hero actions", async ({ page }) => {
    await page.goto("/en");
    const primary = page.getByRole("main").getByRole("link", { name: "Explore all tools" });
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      if (await primary.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(primary).toBeFocused();
  });
});

test.describe("telemetry without environment variables", () => {
  test("loads no analytics or Sentry and sets no cookies", async ({ page, context }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // An uncaught error would load the Sentry chunk if error reporting were on.
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("e2e: telemetry off");
      });
    });
    await page.waitForTimeout(500);
    await page.getByRole("link", { name: "Deutsch" }).click();
    await expect(page).toHaveURL(/\/de$/);

    expect(requests.filter((url) => THIRD_PARTY.test(url))).toEqual([]);
    expect(requests.filter((url) => /sentry/i.test(url))).toEqual([]);
    await expect(page.locator('script[src*="cloudflareinsights"]')).toHaveCount(0);
    expect(await context.cookies()).toEqual([]);
  });

  test("the CSP allows no third-party origin", async ({ page }) => {
    const response = await page.goto("/en");
    const csp = response?.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(THIRD_PARTY);
  });
});
