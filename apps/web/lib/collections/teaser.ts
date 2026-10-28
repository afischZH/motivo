/**
 * Small previews for `CollectionTeaser`. Kept out of the component on
 * purpose: the item data pulls in the engine's colour code, and on the
 * category page that split the shared server chunk into one more copy
 * (about 90 KiB gzip in the Worker). The category page shows the teaser
 * without previews; pages that render items anyway pass them in.
 */
import type { CollectionKind } from "@/i18n/slugs";

import { curatedGradients } from "./gradients";
import { curatedPalettes } from "./palettes";

export interface TeaserPreview {
  id: string;
  /** Inline style of a gradient preview; palettes show `colors` as stripes. */
  style?: Readonly<Record<string, string>>;
  colors: readonly string[];
}

const PREVIEW_COUNT = 4;

/** One item from each mood group (the collections list six per group). */
export function teaserPreviews(kind: CollectionKind): TeaserPreview[] {
  if (kind === "gradients") {
    return curatedGradients()
      .filter((_, i) => i % 6 === 0)
      .slice(0, PREVIEW_COUNT)
      .map((g) => ({
        id: g.id,
        // A decorative hint (aria-hidden): a plain OKLCH gradient of the stops.
        style: { backgroundImage: `linear-gradient(in oklch 135deg, ${g.colors.join(", ")})` },
        colors: [],
      }));
  }
  return curatedPalettes()
    .filter((_, i) => i % 6 === 0)
    .slice(0, PREVIEW_COUNT)
    .map((p) => ({ id: p.id, colors: p.colors }));
}
