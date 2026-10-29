/**
 * M5b-AP04: "Reuse" between tools (docs/ARCHITECTURE.md 4.18). A design is
 * handed over as a picture to a tool that takes one (mesh gradient to the
 * screenshot beautifier, polka dots to halftone), by keyboard, through the
 * tab's memory: the picture lands in the target field as one undo step and
 * never in the share link. Colour tools save their palette into the local
 * Brand Kit, and every tool then offers it. axe in light and dark mode.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { enableClipboard } from "./support/clipboard";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const editorPath = (toolId: string) => `/en/tools/${toolSlug(toolId, "en")}`;

async function openEditor(page: Page, toolId: string) {
  await page.goto(editorPath(toolId));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share" })).toBeEnabled();
  await expect(page.getByTestId("reuse-menu")).toBeEnabled();
}

/** Opens "Reuse" by keyboard and moves to the item of `toolId` with the arrow keys. */
async function chooseByKeyboard(page: Page, toolId: string) {
  await page.getByTestId("reuse-menu").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  for (let i = 0; i < 30; i++) {
    const focused = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.dataset.tool ?? null,
    );
    if (focused === toolId) break;
    await page.keyboard.press("ArrowDown");
  }
  await expect(page.locator(`[data-testid="reuse-target"][data-tool="${toolId}"]`)).toBeFocused();
  await page.keyboard.press("Enter");
}

async function shareUrl(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByTestId("shell-flash")).toContainText("Link copied");
  return page.evaluate(() => navigator.clipboard.readText());
}

test.describe("reuse as a picture", () => {
  test("mesh gradient into the screenshot beautifier, by keyboard, never in the link", async ({
    page,
    context,
    browserName,
  }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "mesh-gradient");
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET" || r.postData()) requests.push(`${r.method()} ${r.url()}`);
    });

    await chooseByKeyboard(page, "screenshot-beautifier");
    await expect(page).toHaveURL(new RegExp(`${editorPath("screenshot-beautifier")}$`), {
      timeout: 20_000,
    });
    const field = page.locator('[data-control="screenshot"]');
    await expect(field.getByTestId("asset-name")).toHaveText(/^musterli-mesh-gradient-\d+\.png$/, {
      timeout: 20_000,
    });
    await expect(page.getByTestId("shell-flash")).toContainText(
      "Picture from Mesh Gradient added.",
    );
    // The hand-over token is gone from the address.
    expect(new URL(page.url()).hash).toBe("");
    expect(requests).toEqual([]);

    // The share link leaves the picture out.
    const url = await shareUrl(page);
    expect(url).toMatch(/#d=/);
    expect(url.length).toBeLessThan(2000);
    expect(url).not.toContain("handoff");
    const other = await context.newPage();
    await other.goto(url);
    await expect(other.locator('[data-control="screenshot"]').getByTestId("asset-name")).toHaveText(
      "No file of your own",
    );
    await other.close();

    // One undo step takes it out again.
    await page.locator("body").press("ControlOrMeta+Z");
    await expect(field.getByTestId("asset-name")).toHaveText("No file of your own");
  });

  test("polka dots into halftone as the photo, by keyboard", async ({
    page,
    context,
    browserName,
  }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "polka-dots");
    const size = await page.getByRole("img", { name: /Preview:/ }).getAttribute("aria-label");
    const [, width, height] = /(\d+) × (\d+) px/.exec(size ?? "") ?? [];

    await chooseByKeyboard(page, "halftone");
    await expect(page).toHaveURL(new RegExp(`${editorPath("halftone")}$`), { timeout: 20_000 });
    const field = page.locator('[data-control="photo"]');
    await expect(field.getByTestId("asset-name")).toHaveText(/^musterli-polka-dots-\d+\.png$/, {
      timeout: 20_000,
    });
    // The design takes the size of the photo, as with an upload.
    await expect(
      page.getByRole("img", { name: new RegExp(`${width} × ${height} px`) }),
    ).toBeVisible();

    const url = await shareUrl(page);
    expect(url.length).toBeLessThan(2000);
    const other = await context.newPage();
    await other.goto(url);
    await expect(other.locator('[data-control="photo"]').getByTestId("asset-name")).toHaveText(
      "No file of your own",
    );
    await other.close();
  });

  test("a reload of the target does not bring the picture back", async ({ page }) => {
    await openEditor(page, "mesh-gradient");
    await chooseByKeyboard(page, "duotone");
    const field = page.locator('[data-control="photo"]');
    await expect(field.getByTestId("asset-name")).toHaveText(/^musterli-mesh-gradient/, {
      timeout: 20_000,
    });
    // An old token (e.g. from the history) finds nothing and says so.
    await page.goto("/en/tools");
    await page.goto(`${editorPath("duotone")}#handoff=0123456789abcdef0123456789abcdef`);
    await expect(page.getByTestId("shell-notice")).toContainText("The picture handed over is gone");
  });
});

test.describe("save as brand palette", () => {
  test("palette generator into the Brand Kit, then offered in the mesh gradient", async ({
    page,
  }) => {
    await openEditor(page, "palette-generator");
    await page.getByTestId("reuse-menu").focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("reuse-brand-palette").focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Save as brand palette" });
    await expect(dialog).toBeVisible();
    const colors = await dialog
      .getByTestId("save-palette-colors")
      .locator("li")
      .evaluateAll((items) => items.map((li) => li.getAttribute("title") ?? ""));
    expect(colors.length).toBeGreaterThanOrEqual(2);
    const name = dialog.getByLabel("Name");
    await name.fill("Handoff test");
    await name.press("Enter");
    await expect(dialog.getByTestId("save-palette-status")).toContainText(
      "Palette “Handoff test” saved in your Brand Kit.",
    );
    await expect(dialog.getByRole("link", { name: "Open Brand Kit" })).toHaveAttribute(
      "href",
      "/en/brand-kit",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("reuse-menu")).toBeFocused();

    await openEditor(page, "mesh-gradient");
    const select = page.getByTestId("brand-palette-select");
    await expect(select.locator("option:checked")).toHaveText("Handoff test (default)");
    await page.getByTestId("brand-palette-apply").click();
    await expect(page.getByTestId("shell-flash")).toHaveText(
      "Brand palette “Handoff test” applied.",
    );
    // The colour controls now show the saved colours.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll("[data-control]"), (el) =>
            [
              el.textContent ?? "",
              ...Array.from(el.querySelectorAll("[aria-label]"), (a) =>
                a.getAttribute("aria-label"),
              ),
            ].join(" "),
          )
            .join(" ")
            .toLowerCase(),
        ),
      )
      .toContain(colors[0]?.toLowerCase() ?? "#");
  });
});

test.describe("accessibility", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`menu and palette dialog have no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openEditor(page, "palette-generator");
      await page.getByTestId("reuse-menu").click();
      await expect(page.getByRole("menu")).toBeVisible();
      const menu = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(menu.violations).toEqual([]);

      await page.getByTestId("reuse-brand-palette").click();
      await expect(page.getByTestId("save-palette-dialog")).toBeVisible();
      const dialog = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(dialog.violations).toEqual([]);
    });
  }
});
