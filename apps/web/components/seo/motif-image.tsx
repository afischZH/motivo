import type { AnyToolDefinition } from "@musterli/tool-registry";

import { cn } from "@/lib/utils";
import { DEFAULT_MOTIF, hasStaticMotif, motifPath, toolSize } from "@/lib/seo/motifs";

interface MotifImageProps {
  tool: AnyToolDefinition;
  /** `DEFAULT_MOTIF` or a preset id. */
  designId?: string;
  /** Accessible text; empty for decorative use next to a visible name. */
  alt: string;
  /** Above the fold: load eagerly with high priority. */
  priority?: boolean;
  className?: string;
}

/**
 * A prerendered motif SVG (`/motifs/...`) as a plain `<img>`: no client JS,
 * intrinsic size set so the layout does not shift, lazy below the fold.
 * Tools that cannot be rendered on the server show a neutral placeholder.
 */
export function MotifImage({
  tool,
  designId = DEFAULT_MOTIF,
  alt,
  priority = false,
  className,
}: MotifImageProps) {
  const { width, height } = toolSize(tool);
  if (!hasStaticMotif(tool)) {
    return (
      <div
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={cn("bg-muted", className)}
        style={{ aspectRatio: `${width} / ${height}` }}
      />
    );
  }
  return (
    // A static SVG file; next/image would add nothing but a client loader.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={motifPath(tool.id, designId)}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      draggable={false}
      className={cn("block h-auto max-w-full", className)}
    />
  );
}
