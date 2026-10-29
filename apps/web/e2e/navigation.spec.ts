/**
 * Usability of the site shell and catalogue: current section in the main
 * navigation, the mobile menu and the catalogue's instant search.
 */
import AxeBuilder from "@axe-core/playwright";
import { builtInTools } from "@musterli/tool-registry";
import { expect, test, type Page } from "@playwright/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const search = (page: Page) => page.getByRole("searchbox", { name: "Generatoren durchsuchen" });

test.describe("main navigation", () => {
  test("marks the current section", async ({ page }) => {
    await page.goto("/de/tools");
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav.getByRole("link", { name: "Tools" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Konverter" })).not.toHaveAttribute("aria-current");
  });

  test("collapses into a side sheet on small screens", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/de");
    const button = page.getByRole("button", { name: "Menü", exact: true });
    const sheet = page.getByRole("dialog", { name: "Musterli" });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("link", { name: "Brand Kit" })).toBeHidden();

    await button.click();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Brand Kit" })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();

    await button.click();
    await sheet
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("link", { name: "Konverter" })
      .click();
    await expect(page).toHaveURL(/\/de\/konverter$/);
    await expect(sheet).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("catalogue search", () => {
  test("filters as you type and ignores accents", async ({ page }) => {
    await page.goto("/de/tools");
    const cards = page.getByRole("main").getByRole("article");
    await expect(cards).toHaveCount(builtInTools.length);

    // "/" jumps into the field once the page is interactive.
    await expect(async () => {
      await page.locator("body").press("/");
      await expect(search(page)).toBeFocused({ timeout: 500 });
    }).toPass();
    await page.keyboard.type("verlaufe");
    await expect(page.getByRole("status")).toHaveText(/\d+ Treffer/);
    const gradients = builtInTools.filter((tool) => tool.category.includes("gradients"));
    expect(await cards.count()).toBeGreaterThanOrEqual(gradients.length);
    await expect(page.getByRole("heading", { level: 2, name: /^Farben/ })).toBeHidden();

    await search(page).fill("xyzzy");
    await expect(cards).toHaveCount(0);
    await expect(page.getByText("Nichts gefunden für «xyzzy».")).toBeVisible();
    await page.getByRole("button", { name: "Suche zurücksetzen" }).click();
    await expect(cards).toHaveCount(builtInTools.length);
    await expect(search(page)).toBeFocused();
  });

  test("Escape clears the search", async ({ page }) => {
    await page.goto("/en/tools");
    const field = page.getByRole("searchbox", { name: "Search generators" });
    await field.fill("blob");
    await expect(page.getByRole("link", { name: "Blob Generator", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Polka Dots", exact: true })).toBeHidden();
    await field.press("Escape");
    await expect(field).toHaveValue("");
    await expect(page.getByRole("link", { name: "Polka Dots", exact: true })).toBeVisible();
  });
});
