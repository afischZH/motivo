/**
 * Static SVG motifs for landing pages and catalogue cards:
 * `/motifs/<toolId>/<default|presetId>.svg`. Prerendered at build time for
 * every registered tool, served as static files, and shared by all locales.
 * Separate files instead of inline data URLs keep the HTML small (some
 * motifs weigh 100 KB and more) and let the browser lazy-load and cache them.
 */
import { registry } from "@motivo/tool-registry";

import { designSvg, findDesign, hasStaticMotif, staticDesigns } from "@/lib/seo/motifs";

export const dynamic = "force-static";
export const dynamicParams = false;

type Params = { toolId: string; file: string };

export function generateStaticParams(): Params[] {
  return registry
    .list()
    .filter(hasStaticMotif)
    .flatMap((tool) =>
      staticDesigns(tool).map((design) => ({ toolId: tool.id, file: `${design.id}.svg` })),
    );
}

export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const { toolId, file } = await params;
  const tool = registry.get(toolId);
  const design = tool && file.endsWith(".svg") ? findDesign(tool, file.slice(0, -4)) : undefined;
  const svg = tool && design ? designSvg(tool, design) : undefined;
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
