/**
 * M3-AP14: the support page (donations), its footer link and the quiet hint
 * in the export dialog. The donation button depends on the build-time
 * variable `NEXT_PUBLIC_DONATION_URL`: CI sets a placeholder and checks the
 * button, a run without it checks the "link follows soon" state.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { parseDonationUrl } from "../lib/donation";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const DONATION_URL = parseDonationUrl(process.env.NEXT_PUBLIC_DONATION_URL);

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const PAGES = [
  {
    locale: "de",
    path: "/de/unterstuetzen",
    title: "Motivo unterstützen",
    button: "Jetzt spenden",
    soon: "Spenden-Link folgt bald",
    other: "/en/support",
  },
  {
    locale: "en",
    path: "/en/support",
    title: "Support Motivo",
    button: "Donate now",
    soon: "Donation link coming soon",
    other: "/de/unterstuetzen",
  },
] as const;

test.describe("support page", () => {
  for (const p of PAGES) {
    test(`renders in ${p.locale} with hreflang and the donation state`, async ({ page }) => {
      await page.goto(p.path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(p.title);
      await expect(page).toHaveTitle(new RegExp(`^${p.title}`));
      await expect(
        page.locator(`link[rel="alternate"][hreflang="${p.locale === "de" ? "en" : "de"}"]`),
      ).toHaveAttribute("href", new RegExp(`${p.other}$`));

      const donate = page.getByTestId("support-donate");
      if (DONATION_URL) {
        const link = donate.getByRole("link", { name: p.button });
        await expect(link).toHaveAttribute("href", DONATION_URL);
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");
        await expect(donate.getByTestId("support-donate-soon")).toHaveCount(0);
      } else {
        await expect(donate.getByText(p.soon)).toBeVisible();
        await expect(donate.getByRole("link")).toHaveCount(0);
      }
    });
  }

  test("retired waitlist URLs redirect here", async ({ page }) => {
    await page.goto("/de/founders-warteliste");
    await expect(page).toHaveURL(/\/de\/unterstuetzen$/);
    await page.goto("/en/founders-waitlist/confirm");
    await expect(page).toHaveURL(/\/en\/support$/);
  });

  test("the footer links to it", async ({ page }) => {
    await page.goto("/de");
    const footer = page.getByRole("contentinfo");
    await footer.getByRole("link", { name: "Motivo unterstützen" }).click();
    await expect(page).toHaveURL(/\/de\/unterstuetzen$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Motivo unterstützen");
  });

  for (const scheme of ["light", "dark"] as const) {
    for (const p of PAGES) {
      test(`${p.path} has no accessibility violations (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(p.path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoAxeViolations(page);
      });
    }
  }

  test("fits 375 px without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/de/unterstuetzen");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("export dialog hint", () => {
  test("appears only after a successful export and opens the support page", async ({ page }) => {
    await page.goto("/en/tools/blob-generator");
    await expect(page.getByRole("button", { name: "Share" })).toBeEnabled();
    const dialog = page.getByRole("dialog", { name: "Export" });
    await expect(async () => {
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();

    await expect(dialog.getByTestId("export-after")).toHaveCount(0);
    const svg = dialog.getByRole("radio", { name: "SVG", exact: true });
    await dialog.locator(`label[for="${await svg.getAttribute("id")}"]`).click();
    await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    await expect(dialog.getByRole("status")).toHaveText("Downloaded.");

    const hint = dialog.getByTestId("export-after");
    await expect(hint).toHaveText("Enjoying Motivo? Support the project (opens in a new tab).");
    const link = hint.getByRole("link", { name: /Support the project/ });
    await expect(link).toHaveAttribute("href", "/en/support");
    await expect(link).toHaveAttribute("target", "_blank");
    await expectNoAxeViolations(page);

    // Keyboard: the link is reachable inside the modal.
    await link.focus();
    await expect(link).toBeFocused();
  });
});
