/**
 * M4-AP07: terms of use (draft state), footer link, localized slugs,
 * hreflang, sitemap, accessibility, narrow screens and the quiet hint in the
 * export dialog.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const PAGES = [
  {
    path: "/de/nutzungsbedingungen",
    title: "Nutzungsbedingungen",
    banner: "Entwurf, juristisch zu prüfen",
    headings: [
      "Gratis und ohne Gewähr",
      "Alles läuft in deinem Browser",
      "Deine Exporte darfst du frei verwenden",
      "Deine Inhalte",
      "Faire Nutzung",
      "Spenden",
      "Anwendbares Recht und Gerichtsstand",
      "Änderungen",
    ],
    privacy: { name: "Datenschutzerklärung", href: "/de/datenschutz" },
    support: { name: "Musterli unterstützen", href: "/de/unterstuetzen" },
  },
  {
    path: "/en/terms",
    title: "Terms of use",
    banner: "Draft, pending legal review",
    headings: [
      "Free and without warranty",
      "Everything runs in your browser",
      "You may use your exports freely",
      "Your content",
      "Fair use",
      "Donations",
      "Applicable law and jurisdiction",
      "Changes",
    ],
    privacy: { name: "privacy policy", href: "/en/privacy" },
    support: { name: "Support Musterli", href: "/en/support" },
  },
] as const;

test.describe("terms of use", () => {
  for (const p of PAGES) {
    test(`${p.path} is a noindex draft with every section`, async ({ page }) => {
      await page.goto(p.path);
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { level: 1 })).toHaveText(p.title);
      await expect(page.getByTestId("legal-draft-banner")).toContainText(p.banner);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page).toHaveTitle(new RegExp(`^${p.title} · Musterli$`));
      for (const name of p.headings) {
        await expect(main.getByRole("heading", { level: 2, name })).toBeVisible();
      }
      await expect(main).toContainText("CC0 1.0");
      await expect(main).toContainText("Ko-fi");
      // The place of jurisdiction is still an open placeholder.
      await expect(page.getByTestId("legal-placeholder")).toHaveText("[Gerichtsstand]");
      await expect(main.getByRole("link", { name: p.privacy.name })).toHaveAttribute(
        "href",
        p.privacy.href,
      );
      await expect(main.getByRole("link", { name: p.support.name })).toHaveAttribute(
        "href",
        p.support.href,
      );
    });
  }

  test("has hreflang alternates for both languages", async ({ page }) => {
    await page.goto("/en/terms");
    const alternate = (lang: string) => page.locator(`link[rel="alternate"][hreflang="${lang}"]`);
    await expect(alternate("de")).toHaveAttribute("href", /\/de\/nutzungsbedingungen$/);
    await expect(alternate("en")).toHaveAttribute("href", /\/en\/terms$/);
    await expect(alternate("x-default")).toHaveAttribute("href", /\/en\/terms$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/terms$/);
  });

  test("footer links to the localized page, and foreign slugs redirect", async ({ page }) => {
    await page.goto("/de");
    await page.getByRole("contentinfo").getByRole("link", { name: "Nutzungsbedingungen" }).click();
    await expect(page).toHaveURL(/\/de\/nutzungsbedingungen$/);

    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/en\/terms$/);
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Terms of use" }),
    ).toHaveAttribute("href", "/en/terms");

    await page.goto("/de/terms");
    await expect(page).toHaveURL(/\/de\/nutzungsbedingungen$/);
    await page.goto("/en/nutzungsbedingungen");
    await expect(page).toHaveURL(/\/en\/terms$/);
  });

  test("stays out of the sitemap while it is a draft", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("<loc>");
    // Like the imprint and the privacy policy: listed once the review is done.
    expect(sitemap).not.toMatch(/\/(nutzungsbedingungen|terms)</);
    expect(sitemap).not.toMatch(/\/(impressum|imprint)</);
  });

  test("has no horizontal overflow at 375 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const p of PAGES) {
      await page.goto(p.path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, p.path).toBeLessThanOrEqual(0);
    }
  });

  for (const scheme of ["light", "dark"] as const) {
    test.describe(`${scheme} theme`, () => {
      test.use({ colorScheme: scheme });
      for (const p of PAGES) {
        test(`${p.path} has no axe violations`, async ({ page }) => {
          await page.goto(p.path);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await expectNoAxeViolations(page);
        });
      }
    });
  }
});

test.describe("export dialog", () => {
  test("links to the terms after a successful export", async ({ page }) => {
    await page.goto("/de/tools/blob-generator");
    await expect(page.getByRole("button", { name: "Teilen" })).toBeEnabled();
    const dialog = page.getByRole("dialog", { name: "Exportieren" });
    await expect(async () => {
      await page.getByRole("button", { name: "Exportieren", exact: true }).click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();

    await expect(dialog.getByTestId("export-terms-hint")).toHaveCount(0);
    const svg = dialog.getByRole("radio", { name: "SVG", exact: true });
    await dialog.locator(`label[for="${await svg.getAttribute("id")}"]`).click();
    await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Herunterladen" }).click(),
    ]);

    const hint = dialog.getByTestId("export-terms-hint");
    await expect(hint).toHaveText("Frei nutzbar, auch kommerziell (öffnet in neuem Tab).");
    const link = hint.getByRole("link", { name: /Frei nutzbar, auch kommerziell/ });
    await expect(link).toHaveAttribute("href", "/de/nutzungsbedingungen");
    await expect(link).toHaveAttribute("target", "_blank");
    await expectNoAxeViolations(page);
  });
});
