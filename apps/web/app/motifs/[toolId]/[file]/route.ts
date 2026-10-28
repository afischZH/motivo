/**
 * Static SVG motifs for landing pages and catalogue cards:
 * `/motifs/<toolId>/<default|presetId>.svg`, plus the thumbnails of the
 * curated collections (`/motifs/mesh-gradient/gradient-alpenglow.svg`).
 * Prerendered at build time for every registered tool, served as static
 * files, and shared by all locales.
 * Separate files instead of inline data URLs keep the HTML small (some
 * motifs weigh 100 KB and more) and let the browser lazy-load and cache them.
 */
import { registry } from "@musterli/tool-registry";

import { collectionMotifs, findCollectionMotif } from "@/lib/collections/variants";
import { findDesign, hasStaticMotif, staticDesigns, staticMotifSvg } from "@/lib/seo/motifs";

export const dynamic = "force-static";
export const dynamicParams = false;

type Params = { toolId: string; file: string };

export function generateStaticParams(): Params[] {
  return registry
    .list()
    .filter(hasStaticMotif)
    .flatMap((tool) =>
      // Defaults and presets, plus the thumbnails of the gradient and palette collections.
      [...staticDesigns(tool), ...collectionMotifs(tool.id)].map((design) => ({
        toolId: tool.id,
        file: `${design.id}.svg`,
      })),
    );
}

export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const { toolId, file } = await params;
  const tool = registry.get(toolId);
  const id = file.endsWith(".svg") ? file.slice(0, -4) : undefined;
  const design =
    tool && id ? (findDesign(tool, id) ?? findCollectionMotif(tool.id, id)) : undefined;
  const svg = tool && design ? await staticMotifSvg(tool, design) : undefined;
  if (svg === undefined) return new Response(null, { status: 404 });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Generated motifs contain no scripts; this keeps it that way if one is opened directly.
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
