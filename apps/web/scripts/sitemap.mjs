/**
 * Writes `public/sitemap.xml` (`lib/seo/sitemap.ts`) before `next build` and
 * `next dev`. A static file on Cloudflare: Workers Static Assets serves it
 * without running the Worker, and the Worker bundle carries no route (and no
 * copy of the tool registry) for it. Uses `NEXT_PUBLIC_SITE_URL` from the
 * build environment, like the pages.
 *
 * The helpers are the app's own TypeScript sources, loaded with Node's type
 * stripping plus a small resolve hook (`ts-resolve-hook.mjs`).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve-hook.mjs", import.meta.url);

const { sitemapEntries, sitemapXml } = await import("../lib/seo/sitemap.ts");

const entries = sitemapEntries();
await mkdir(new URL("../public/", import.meta.url), { recursive: true });
await writeFile(new URL("../public/sitemap.xml", import.meta.url), sitemapXml(entries));
console.log(`sitemap: ${entries.length} pages -> public/sitemap.xml`);
