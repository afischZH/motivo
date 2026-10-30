/**
 * Writes the static SVG motifs for landing pages, catalogue cards and the
 * image sitemap into `public/motifs/<toolId>/<default|presetId>.svg`, plus
 * the thumbnails of the curated collections
 * (`public/motifs/mesh-gradient/gradient-alpenglow.svg`). Shared by all
 * locales. Runs before `next build` and `next dev`.
 *
 * Plain files instead of a prerendered route handler: Workers Static Assets
 * serves them without running the Worker, and the Worker bundle no longer
 * carries a copy of every tool's render code just for these files.
 * Separate files instead of inline data URLs keep the HTML small (some
 * motifs weigh 100 KB and more) and let the browser lazy-load and cache them.
 *
 * The registry and helpers are the app's own TypeScript sources, loaded with
 * Node's type stripping plus a small resolve hook (`ts-resolve-hook.mjs`).
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve-hook.mjs", import.meta.url);

const OUT_DIR = new URL("../public/motifs/", import.meta.url);

const [{ registry }, motifs, variants] = await Promise.all([
  import("@musterli/tool-registry"),
  import("../lib/seo/motifs.ts"),
  import("../lib/collections/variants.ts"),
]);

const started = performance.now();
await rm(OUT_DIR, { recursive: true, force: true });
let count = 0;

for (const tool of registry.list()) {
  if (!motifs.hasStaticMotif(tool)) continue;
  await mkdir(new URL(`${tool.id}/`, OUT_DIR), { recursive: true });
  // Defaults and presets, plus the thumbnails of the gradient and palette collections.
  for (const design of [...motifs.staticDesigns(tool), ...variants.collectionMotifs(tool.id)]) {
    const svg = await motifs.staticMotifSvg(tool, design);
    if (svg === undefined) throw new Error(`motifs: cannot render ${tool.id}/${design.id}`);
    await writeFile(
      new URL(`.${motifs.motifPath(tool.id, design.id)}`, new URL("../public/", import.meta.url)),
      svg,
    );
    count++;
  }
}

const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`motifs: ${count} files in ${seconds} s -> public/motifs/`);
