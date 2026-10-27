/**
 * M2-AP11: the Content-Security-Policy is enforced and nothing on the main
 * flows violates it (home, editor with PNG export through the raster worker
 * and copy, converter). Violations are caught twice: as
 * `securitypolicyviolation` events in the page and as browser console
 * messages (which also covers workers).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

/** 1×1 transparent PNG. */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const CSP_CONSOLE = /content[- ]security[- ]policy|refused to (load|execute|apply|connect|create)/i;

interface Collected {
  console: string[];
}

/** Starts collecting violations; call before the first navigation. */
async function watchCsp(page: Page): Promise<Collected> {
  const collected: Collected = { console: [] };
  const onConsole = (text: string) => {
    if (CSP_CONSOLE.test(text)) collected.console.push(text);
  };
  page.on("console", (msg) => onConsole(msg.text()));
  page.on("worker", (worker) => worker.on("console", (msg) => onConsole(msg.text())));
  await page.addInitScript(() => {
    const list: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = list;
    document.addEventListener("securitypolicyviolation", (e) => {
      list.push(
        `${e.effectiveDirective} blocked ${e.blockedURI || "inline"} (${e.sourceFile}:${e.lineNumber})`,
      );
    });
  });
  return collected;
}

async function expectNoViolations(page: Page, collected: Collected) {
  const events = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
  expect(events).toEqual([]);
  expect(collected.console).toEqual([]);
}

async function choose(dialog: Locator, name: string) {
  const radio = dialog.getByRole("radio", { name, exact: true });
  const id = await radio.getAttribute("id");
  await dialog.locator(`label[for="${id}"]`).click();
  await expect(radio).toBeChecked();
}

test.describe("content security policy", () => {
  test("home page sends the policy and runs without violations", async ({ page }) => {
    const collected = await watchCsp(page);
    const response = await page.goto("/en");
    const headers = response?.headers() ?? {};
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The inline theme script ran (and was allowed): the dark class follows the system.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expectNoViolations(page, collected);
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  });

  test("redirects carry the security headers too", async ({ request }) => {
    const response = await request.get("/", { maxRedirects: 0 });
    expect([307, 308]).toContain(response.status());
    expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("the policy is enforced: scripts from other sources are blocked", async ({ page }) => {
    // Proves the header is enforced, not just sent (works in dev and production).
    await watchCsp(page);
    await page.goto("/en");
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const script = document.createElement("script");
          script.src = "data:text/javascript,window.__injected=1";
          script.onerror = () => resolve();
          script.onload = () => resolve();
          document.head.append(script);
        }),
    );
    expect(
      await page.evaluate(() => (window as unknown as { __injected?: number }).__injected),
    ).toBeUndefined();
    const events = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    expect(events).toEqual([expect.stringMatching(/^script-src(-elem)? blocked data/)]);
  });

  test("editor: PNG export through the worker and copy run without violations", async ({
    page,
    context,
    browserName,
  }) => {
    const collected = await watchCsp(page);
    const workers: string[] = [];
    page.on("worker", (worker) => workers.push(worker.url()));
    if (browserName === "chromium") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    }
    await page.goto("/en/tools/blob-generator");
    await expect(page.getByTestId("preview").locator("img")).toBeVisible();
    await expect(page.getByRole("button", { name: "Share" })).toBeEnabled();

    const dialog = page.getByRole("dialog", { name: "Export" });
    await expect(async () => {
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    await choose(dialog, "PNG");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    await expect(dialog.getByRole("status")).toHaveText("Downloaded.");
    if (browserName === "chromium") expect(workers.length).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await expectNoViolations(page, collected);

    // Copy a code export (clipboard permissions exist only in Chromium).
    if (browserName !== "chromium") return;
    await page.goto("/en/tools/css-gradient-generator");
    await expect(page.getByRole("button", { name: "Share" })).toBeEnabled();
    await expect(async () => {
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    await choose(dialog, "Tailwind classes");
    await dialog.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText("Copied! Off to your project.");
    await expectNoViolations(page, collected);
  });

  test("converters: SVG preview and Base64 decoding run without violations", async ({ page }) => {
    const collected = await watchCsp(page);
    await page.goto("/en/convert/svg-to-css");
    await page.getByRole("button", { name: "Insert example" }).click();
    await expect(page.getByRole("textbox", { name: "Converted code" })).toHaveValue(
      /^background-image: url\("data:image\/svg\+xml,/,
    );
    await expect(page.getByRole("img", { name: "Preview of the converted image" })).toBeVisible();
    await expectNoViolations(page, collected);

    await page.goto("/en/convert/base64-to-image");
    const input = page.getByLabel("Base64 or data URI");
    const preview = page.getByRole("img", { name: "Preview of the converted image" });
    await expect(async () => {
      await input.fill("");
      await input.fill(`data:image/png;base64,${PNG_BASE64}`);
      await expect(preview).toHaveAttribute("src", /^blob:/, { timeout: 3000 });
    }).toPass({ timeout: 20_000 });
    await expectNoViolations(page, collected);
  });
});
