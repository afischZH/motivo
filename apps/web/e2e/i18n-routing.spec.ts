/**
 * M2-AP07: localized slugs, redirects from M1 paths, hreflang and canonical
 * links, and a language switcher that stays on the equivalent page.
 */
import { expect, test, type Page } from "@playwright/test";

import { FALLBACK_SITE_URL } from "../lib/seo/site-url";

/** Base URL of canonical links: the env value if the server got one. */
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/+$/, "");

async function headLinks(page: Page) {
  return page.evaluate(() => {
    const links = [...document.head.querySelectorAll<HTMLLinkElement>("link")];
    return {
      canonical: links.filter((l) => l.rel === "canonical").map((l) => l.getAttribute("href")),
      alternates: Object.fromEntries(
        links
          .filter((l) => l.rel === "alternate" && l.hreflang)
          .map((l) => [l.hreflang, l.getAttribute("href")]),
      ),
    };
  });
}

const PAGES: { path: string; de: string; en: string; xDefault: string }[] = [
  // Next drops the trailing slash of the bare origin.
  { path: "/en", de: "/de", en: "/en", xDefault: "" },
  { path: "/de/tools", de: "/de/tools", en: "/en/tools", xDefault: "/de/tools" },
  {
    path: "/en/tools/svg-wave-generator",
    de: "/de/tools/svg-wellen-generator",
    en: "/en/tools/svg-wave-generator",
    xDefault: "/de/tools/svg-wellen-generator",
  },
  { path: "/en/convert", de: "/de/konverter", en: "/en/convert", xDefault: "/de/konverter" },
  {
    path: "/de/konverter/bild-zu-base64",
    de: "/de/konverter/bild-zu-base64",
    en: "/en/convert/image-to-base64",
    xDefault: "/de/konverter/bild-zu-base64",
  },
];

test.describe("hreflang and canonical", () => {
  for (const p of PAGES) {
    test(p.path, async ({ page }) => {
      const response = await page.goto(p.path);
      expect(response?.status()).toBe(200);
      const { canonical, alternates } = await headLinks(page);
      expect(canonical).toEqual([`${SITE}${p.path}`]);
      expect(alternates).toEqual({
        de: `${SITE}${p.de}`,
        en: `${SITE}${p.en}`,
        "x-default": `${SITE}${p.xDefault}`,
      });
    });
  }
});

test.describe("redirects from M1 paths", () => {
  const CASES = [
    ["/en/tools/blob", "/en/tools/blob-generator"],
    ["/de/tools/css-gradient", "/de/tools/css-verlauf-generator"],
    ["/en/tools/css-verlauf-generator", "/en/tools/css-gradient-generator"],
    ["/de/convert", "/de/konverter"],
    ["/de/convert/svg-to-css", "/de/konverter/svg-zu-css"],
    ["/en/convert/base64-zu-bild", "/en/convert/base64-to-image"],
  ] as const;

  for (const [from, to] of CASES) {
    test(`${from} is permanently redirected`, async ({ request }) => {
      const response = await request.get(from, { maxRedirects: 0 });
      expect([301, 307, 308]).toContain(response.status());
      expect(new URL(response.headers().location ?? "", "http://x").pathname).toBe(to);
    });
  }

  test("an old share link keeps its #d= hash", async ({ page }) => {
    await page.goto("/en/tools/blob#d=@@not-a-design@@");
    await expect(page).toHaveURL(/\/en\/tools\/blob-generator#d=@@not-a-design@@$/);
    // The shell still sees the hash after the redirect and reports the bad link.
    await expect(
      page.getByRole("alert").filter({ hasText: "The shared link is damaged." }),
    ).toBeVisible();
  });
});

test.describe("language switcher", () => {
  test("keeps the tool with its localized slug", async ({ page }) => {
    await page.goto("/en/tools/polka-dot-pattern-generator");
    const nav = page.getByRole("navigation", { name: "Language" });
    await expect(nav.getByRole("link", { name: "English" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    const deutsch = nav.getByRole("link", { name: "Deutsch" });
    await expect(deutsch).toHaveAttribute("href", "/de/tools/punktmuster-generator");
    // Wait for hydration: under `next dev` a click during it can get lost.
    await expect(page.getByRole("button", { name: "Share" })).toBeEnabled();
    await deutsch.click();
    // Generous timeout: `next dev` compiles the target page on first request.
    await expect(page).toHaveURL(/\/de\/tools\/punktmuster-generator$/, { timeout: 30_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });

  test("keeps the converter with its localized section and slug, by keyboard", async ({ page }) => {
    await page.goto("/de/konverter/svg-zu-css");
    const english = page
      .getByRole("navigation", { name: "Sprache" })
      .getByRole("link", { name: "English" });
    await english.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/en\/convert\/svg-to-css$/, { timeout: 30_000 });
  });
});
