import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const html = (page: Page) => page.locator("html");

test.describe("routing and i18n", () => {
  test("/ redirects to a locale and renders landmarks", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/(de|en)$/);
    await expect(html(page)).toHaveAttribute("lang", /^(de|en)$/);
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test.describe("German Accept-Language", () => {
    test.use({ locale: "de-CH" });

    test("/ redirects to /de", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/de$/);
    });
  });

  test.describe("English Accept-Language", () => {
    test.use({ locale: "en-US" });

    test("/ redirects to /en", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/en$/);
    });
  });

  test("/de renders German", async ({ page }) => {
    const response = await page.goto("/de");

    expect(response?.status()).toBe(200);
    await expect(html(page)).toHaveAttribute("lang", "de");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Motive per Klick");
    await expect(page.getByRole("link", { name: "Zum Inhalt springen" })).toBeAttached();
  });

  test("/en renders English", async ({ page }) => {
    const response = await page.goto("/en");

    expect(response?.status()).toBe(200);
    await expect(html(page)).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Motifs in one click");
  });

  test("language switch keeps the page", async ({ page }) => {
    await page.goto("/de");
    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(html(page)).toHaveAttribute("lang", "en");
  });

  test("skip link moves focus to main", async ({ page }) => {
    await page.goto("/en");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });
});

test.describe("theme", () => {
  test.use({ colorScheme: "light" });

  test("toggle switches the dark class and persists after reload", async ({ page }) => {
    await page.goto("/en");
    const toggle = page.getByRole("button", { name: "Dark theme" });

    await expect(html(page)).not.toHaveClass(/\bdark\b/);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "Dark theme" }).click();
    await page.reload();
    await expect(html(page)).not.toHaveClass(/\bdark\b/);
  });

  test("theme survives a locale switch", async ({ page }) => {
    await page.goto("/de");
    await page.getByRole("button", { name: "Dunkles Design" }).click();
    await page.getByRole("link", { name: "English" }).click();

    await expect(page).toHaveURL(/\/en$/);
    await expect(html(page)).toHaveClass(/\bdark\b/);
  });

  test("toggle is keyboard operable", async ({ page }) => {
    await page.goto("/en");
    const toggle = page.getByRole("button", { name: "Dark theme" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await page.keyboard.press("Space");
    await expect(html(page)).not.toHaveClass(/\bdark\b/);
  });

  test("Ctrl+Shift+K and Meta+Shift+K toggle the theme", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("button", { name: "Dark theme" })).toBeVisible();

    await page.keyboard.press("Control+Shift+K");
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await page.keyboard.press("Meta+Shift+K");
    await expect(html(page)).not.toHaveClass(/\bdark\b/);
  });

  test.describe("system dark preference", () => {
    test.use({ colorScheme: "dark" });

    test("is applied before first paint without a stored choice", async ({ page }) => {
      // Record the class as soon as the DOM is parsed, before hydration effects run.
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          document.documentElement.dataset.initialClass = document.documentElement.className;
        });
      });
      await page.goto("/en");
      await expect(html(page)).toHaveAttribute("data-initial-class", /\bdark\b/);
    });
  });
});

test.describe("accessibility", () => {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`${scheme} theme`, () => {
      test.use({ colorScheme: scheme });

      for (const locale of ["de", "en"]) {
        test(`/${locale} has no axe violations`, async ({ page }) => {
          await page.goto(`/${locale}`);
          await expect(page.getByRole("main")).toBeVisible();
          if (scheme === "dark") await expect(html(page)).toHaveClass(/\bdark\b/);
          else await expect(html(page)).not.toHaveClass(/\bdark\b/);

          await expectNoAxeViolations(page);
        });
      }
    });
  }
});
