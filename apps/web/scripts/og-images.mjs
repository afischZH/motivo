/**
 * Renders the Open Graph images of every registered tool in every enabled
 * locale into `public/og/<locale>/<toolId>.png` (see `lib/seo/og.ts`).
 * Runs before `next build` and `next dev`. Uses `next/og` in Node, so the
 * Worker bundle never contains Satori or resvg, and the images are plain
 * static assets on Cloudflare.
 *
 * The registry and helpers are the app's own TypeScript sources, loaded with
 * Node's type stripping plus a small resolve hook (`ts-resolve-hook.mjs`).
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve-hook.mjs", import.meta.url);

const APP_ROOT = new URL("../", import.meta.url);
const OUT_DIR = new URL("public/og/", APP_ROOT);

const [{ registry }, motifs, og, locales, ogModule] = await Promise.all([
  import("@motivo/tool-registry"),
  import("../lib/seo/motifs.ts"),
  import("../lib/seo/og.ts"),
  import("../i18n/locales.ts"),
  // next has no ESM exports map: the CommonJS entry needs its file name.
  import("next/og.js"),
]);
// next/og is CommonJS; the named export sits on the default export in Node.
const ImageResponse = ogModule.ImageResponse ?? ogModule.default.ImageResponse;

function lookup(messages, key) {
  return key.split(".").reduce((node, part) => node?.[part], messages);
}

const started = performance.now();
await rm(OUT_DIR, { recursive: true, force: true });
let count = 0;

for (const locale of locales.ENABLED_LOCALES) {
  const messages = JSON.parse(await readFile(new URL(`messages/${locale}.json`, APP_ROOT), "utf8"));
  await mkdir(new URL(`${locale}/`, OUT_DIR), { recursive: true });

  for (const tool of registry.list()) {
    if (!motifs.hasStaticMotif(tool)) continue;
    const design = motifs.findDesign(tool, motifs.DEFAULT_MOTIF);
    const svg = design && motifs.designSvg(tool, design);
    const title = lookup(messages, `tools.${tool.id}.name`);
    if (!svg || typeof title !== "string") {
      throw new Error(`og-images: cannot render ${tool.id} (${locale})`);
    }
    const element = og.ogElement({ svg, brand: lookup(messages, "Layout.brand"), title });
    const response = new ImageResponse(element, { ...og.OG_SIZE });
    const png = Buffer.from(await response.arrayBuffer());
    const file = new URL(`.${og.ogImagePath(tool.id, locale)}`, new URL("public/", APP_ROOT));
    await writeFile(file, png);
    count++;
  }
}

const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`og-images: ${count} images in ${seconds} s -> public/og/`);
