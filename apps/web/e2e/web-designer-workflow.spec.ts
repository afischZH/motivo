/**
 * W1 (web designer workflow): the command palette (⌘/Ctrl+K), favourites and
 * recently used tools, the "In context" view of the editor and the
 * catalogue by task.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const palette = (page: Page) => page.getByTestId("command-palette");
const paletteInput = (page: Page) => page.getByTestId("command-palette-input");

async function openPalette(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette(page)).toBeVisible();
  await expect(paletteInput(page)).toBeFocused();
}

test.describe("command palette", () => {
  test("finds a tool by its English id on the German site and opens it", async ({ page }) => {
    await page.goto("/de");
    await openPalette(page);
    await expectNoAxeViolations(page);
    await paletteInput(page).fill("flow field");
    const first = palette(page).getByRole("option").first();
    await expect(first).toHaveAttribute("aria-selected", "true");
    await expect(first).toContainText("Flow Fields");
    await page.keyboard.press("Enter");
    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(/\/de\/tools\/flow-field-generator$/);
    await expect(page.getByTestId("preview")).toBeVisible();
  });

  test("runs editor actions and moves with the arrow keys", async ({ page }) => {
    await page.goto("/en/tools/mesh-gradient");
    await expect(page.getByTestId("preview")).toBeVisible();
    await openPalette(page);
    const options = palette(page).getByRole("option");
    await expect(options.first()).toHaveText(/Export/);
    await page.keyboard.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(palette(page)).toBeHidden();
    await expect(page.getByRole("dialog", { name: /Export/ })).toBeVisible();
  });

  test("opens from the header button and closes with Escape", async ({ page }) => {
    await page.goto("/en/tools");
    const trigger = page.getByTestId("command-palette-open");
    await trigger.click();
    await expect(palette(page)).toBeVisible();
    await paletteInput(page).fill("zzzz-nothing");
    await expect(palette(page)).toContainText("Nothing found");
    await page.keyboard.press("Escape");
    await expect(palette(page)).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe("favourites and recently used", () => {
  test("remembers visited and starred tools in this browser", async ({ page }) => {
    await page.goto("/en/tools");
    await expect(page.getByTestId("your-tools")).toHaveCount(0);

    await page.goto("/en/tools/polka-dots");
    await expect(page.getByTestId("preview")).toBeVisible();
    const star = page.getByTestId("favorite-toggle");
    await expect(star).toBeEnabled();
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");

    await page.goto("/en/tools/mesh-gradient");
    await expect(page.getByTestId("preview")).toBeVisible();

    await page.goto("/en/tools");
    const yours = page.getByTestId("your-tools");
    await expect(yours.getByTestId("your-tools-favorites")).toContainText("Polka Dots");
    // Starred tools are not repeated under "Recently used".
    await expect(yours.getByTestId("your-tools-recent")).toContainText("Mesh Gradient");
    await expect(yours.getByTestId("your-tools-recent")).not.toContainText("Polka Dots");

    await openPalette(page);
    await expect(palette(page).getByRole("group", { name: "Favorites" })).toContainText(
      "Polka Dots",
    );
    await expect(palette(page).getByRole("group", { name: "Recently used" })).toContainText(
      "Mesh Gradient",
    );
  });
});

test.describe("in context", () => {
  test("shows the motif behind a mock hero with its contrast", async ({ page }) => {
    await page.goto("/de/tools/mesh-gradient");
    await expect(page.getByTestId("preview")).toBeVisible();
    const toggle = page.getByTestId("context-toggle");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("context-layer")).toBeVisible();
    const contrast = page.getByTestId("context-contrast");
    await expect(contrast).toHaveText(/Kontrast \d+\.\d:1/);

    // A fixed tone overrides the automatic choice.
    await page.getByTestId("context-tone-light").click();
    await expect(page.getByTestId("context-layer")).toHaveAttribute("data-tone", "light");
    await page.getByTestId("context-tone-dark").click();
    await expect(page.getByTestId("context-layer")).toHaveAttribute("data-tone", "dark");
    await expectNoAxeViolations(page);
  });

  test("is not offered for tools that are not backgrounds", async ({ page }) => {
    await page.goto("/en/tools/contrast-checker");
    await expect(page.getByTestId("preview")).toBeVisible();
    await expect(page.getByTestId("context-toggle")).toHaveCount(0);
  });
});

test.describe("catalogue by task", () => {
  test("links from the catalogue to a task page with its tools", async ({ page }) => {
    await page.goto("/de/tools");
    await page.getByTestId("tasks-nav").getByRole("link", { name: "Hero-Hintergründe" }).click();
    await expect(page).toHaveURL(/\/de\/tools\/aufgabe\/hero-hintergruende$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hero-Hintergründe");
    await expect(page.getByRole("heading", { level: 2, name: "Mesh-Verlauf" })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("redirects the other locale's task path", async ({ page }) => {
    await page.goto("/en/tools/aufgabe/ui-effekte");
    await expect(page).toHaveURL(/\/en\/tools\/task\/ui-effects$/);
  });
});
