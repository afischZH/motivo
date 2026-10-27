/**
 * Building blocks shared by the colour tools (docs/TOOLS.md F1 to F3):
 * swatch display params, a CSS name param and a random base colour.
 * Internal to the package.
 */
import { SWATCH_LABELS, oklchToHex, type Rng } from "@motivo/engine";
import * as z from "zod";
import type { CanvasSize, ControlGroup, ControlHint } from "../types";

/** Full HD (a size preset): room for 11 Tailwind steps side by side. */
export const COLOR_TOOL_SIZE: CanvasSize = { width: 1920, height: 1080 };

/** Display params of every colour tool. */
export const swatchDisplayShape = {
  labels: z.enum(SWATCH_LABELS),
  contrast: z.boolean(),
} as const;

/** Free text, sanitised with `toCssName` at export time so typing never breaks the design. */
export const cssNameSchema = z.string().max(32);

export const DISPLAY_GROUP: ControlGroup = {
  id: "display",
  labelKey: "tools.common.groups.display",
};

/**
 * Control hints for the display params. Labels are shared across the colour
 * tools; the params are not randomised, so they get no lock.
 */
export function displayHints<P>(): {
  labels: ControlHint<P>;
  contrast: ControlHint<P>;
} {
  return {
    labels: {
      group: "display",
      // A select: "OKLCH" does not fit a five-way segmented control in the panel.
      kind: "select",
      labelKey: "tools.common.params.labels.label",
      optionLabelKeys: Object.fromEntries(
        SWATCH_LABELS.map((v) => [v, `tools.common.params.labels.options.${v}`]),
      ),
      lockable: false,
    },
    contrast: {
      group: "display",
      labelKey: "tools.common.params.contrast.label",
      descriptionKey: "tools.common.params.contrast.description",
      lockable: false,
    },
  };
}

/** Label key of a CSS name param (shared text). */
export const NAME_LABEL = "tools.common.params.name.label";
export const NAME_DESCRIPTION = "tools.common.params.name.description";

/** A pleasant random base colour: mid lightness, clear chroma, any hue. */
export function randomBaseColor(rng: Rng): string {
  return oklchToHex({ l: rng.float(0.5, 0.72), c: rng.float(0.09, 0.2), h: rng.float(0, 360) });
}
