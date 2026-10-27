import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("home page smoke", () => {
  test("responds with 200 and has a language and main landmark", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", /^[a-z]{2}(-[A-Z]{2})?$/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("has no axe accessibility violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
