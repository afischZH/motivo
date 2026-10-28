/**
 * M2-AP05: Palette Generator (docs/TOOLS.md F1). Space generates a new
 * palette in an OKLCH harmony; locked colours stay and steer the harmony.
 *
 * Per-colour locks use the generic lock system: every colour is its own
 * param (`color1` ... `color8`), so each swatch gets the standard lock
 * button and `keepLocked` without any palette-specific code in the shell.
 * `count` decides how many slots are shown and rendered. Changing the
 * harmony regenerates the unlocked colours from the current seed
 * (`regenerateOn`), Space rolls a new seed.
 */
import {
  HARMONIES,
  HARMONY_MODES,
  colorList,
  cssVariables,
  harmonyPalette,
  swatchesSvg,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { ControlHint, Preset } from "../types";
import { COLOR_TOOL_SIZE, DISPLAY_GROUP, displayHints, swatchDisplayShape } from "./color-shared";
import { EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "palette-generator";

/** Number of colour slots; `count` shows the first n. */
export const PALETTE_SLOTS = 8;
const SLOT_KEYS = [
  "color1",
  "color2",
  "color3",
  "color4",
  "color5",
  "color6",
  "color7",
  "color8",
] as const;
type SlotKey = (typeof SLOT_KEYS)[number];

const schema = z.object({
  count: z.int().min(2).max(PALETTE_SLOTS),
  harmony: z.enum(HARMONY_MODES),
  color1: colorSchema,
  color2: colorSchema,
  color3: colorSchema,
  color4: colorSchema,
  color5: colorSchema,
  color6: colorSchema,
  color7: colorSchema,
  color8: colorSchema,
  ...swatchDisplayShape,
  matrix: z.boolean(),
});

export type PaletteGeneratorParams = z.output<typeof schema>;

/** The visible colours in slot order. */
export function paletteColors(p: PaletteGeneratorParams): string[] {
  return SLOT_KEYS.slice(0, p.count).map((k) => p[k]);
}

const slots = (colors: readonly string[]): Record<SlotKey, string> => {
  const filler = [
    "#f8f9fa",
    "#dee2e6",
    "#adb5bd",
    "#495057",
    "#212529",
    "#343a40",
    "#6c757d",
    "#ced4da",
  ];
  return Object.fromEntries(
    SLOT_KEYS.map((k, i) => [k, colors[i] ?? (filler[i] as string)]),
  ) as Record<SlotKey, string>;
};

const defaults: PaletteGeneratorParams = {
  count: 5,
  harmony: "auto",
  ...slots(["#f4f1de", "#e07a5f", "#3d405b", "#81b29a", "#f2cc8f"]),
  labels: "hex",
  contrast: true,
  matrix: false,
};

const preset = (
  id: string,
  colors: readonly string[],
  params: Partial<PaletteGeneratorParams> = {},
): Preset<PaletteGeneratorParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...slots(colors), count: colors.length, ...params },
});

const slotHints = Object.fromEntries(
  SLOT_KEYS.map((key, i) => [
    key,
    {
      group: "palette",
      kind: "color",
      visibleWhen: (p: PaletteGeneratorParams) => p.count > i,
    } satisfies ControlHint<PaletteGeneratorParams>,
  ]),
) as Record<SlotKey, ControlHint<PaletteGeneratorParams>>;

export const paletteGeneratorTool = defineTool({
  id: ID,
  version: 1,
  category: ["colors"],
  schema,
  defaults,
  defaultSize: COLOR_TOOL_SIZE,
  presets: [
    preset("terracotta", ["#f4f1de", "#e07a5f", "#3d405b", "#81b29a", "#f2cc8f"]),
    preset("fjord", ["#e8f1f2", "#a3cef1", "#6096ba", "#274c77", "#1b263b"], {
      harmony: "analogous",
    }),
    preset("citrus", ["#fff8e1", "#ffd23f", "#ee4266", "#540d6e", "#3bceac"], {
      harmony: "tetradic",
    }),
    preset("moss", ["#f0ead2", "#dde5b6", "#adc178", "#a98467", "#6c584c"], {
      harmony: "analogous",
    }),
    preset("harbour", ["#fefae0", "#e9c46a", "#2a9d8f", "#264653"], {
      harmony: "complementary",
    }),
    preset("berry", ["#ffe5ec", "#ff8fab", "#c9184a", "#590d22", "#2d6a4f", "#b7e4c7"], {
      harmony: "split",
      matrix: true,
      labels: "none",
    }),
    preset("primaries", ["#f7f7f2", "#e63946", "#1d3557", "#ffb703"], {
      harmony: "triadic",
      labels: "oklch",
    }),
  ],
  controls: {
    groups: [{ id: "palette", labelKey: `tools.${ID}.groups.palette` }, DISPLAY_GROUP],
    order: ["count", "harmony", ...SLOT_KEYS, "labels", "contrast", "matrix"],
    params: {
      count: { group: "palette", lockable: false },
      harmony: {
        group: "palette",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "harmony", HARMONY_MODES),
        descriptionKey: `tools.${ID}.params.harmony.description`,
        lockable: false,
      },
      ...slotHints,
      ...displayHints<PaletteGeneratorParams>(),
      matrix: {
        group: "display",
        descriptionKey: `tools.${ID}.params.matrix.description`,
        lockable: false,
      },
    },
  },
  randomize(rng, current, locks) {
    const harmony = current.harmony === "auto" ? rng.pick(HARMONIES) : current.harmony;
    const anchorIndex = SLOT_KEYS.slice(0, current.count).findIndex((k) => locks.has(k));
    const anchorKey = SLOT_KEYS[anchorIndex];
    const colors = harmonyPalette({
      harmony,
      count: current.count,
      rng,
      ...(anchorKey ? { anchor: { index: anchorIndex, color: current[anchorKey] } } : {}),
    });
    // Hidden slots keep their colours; they reappear when `count` grows.
    const next: PaletteGeneratorParams = { ...current };
    colors.forEach((c, i) => {
      next[SLOT_KEYS[i] as SlotKey] = c;
    });
    return keepLocked(next, current, locks);
  },
  // A new harmony shows at once: unlocked colours follow from the current seed.
  regenerateOn: ["harmony"],
  // A brand palette shows exactly its colours (up to the 8 slots).
  brandPalette(colors, current) {
    const shown = colors.slice(0, PALETTE_SLOTS);
    const patch: Partial<PaletteGeneratorParams> = { count: Math.max(2, shown.length) };
    shown.forEach((c, i) => {
      patch[SLOT_KEYS[i] as SlotKey] = c;
    });
    return { ...current, ...patch };
  },
  render: {
    kind: "svg",
    render(p, { width, height }) {
      return swatchesSvg({
        width,
        height,
        swatches: paletteColors(p).map((color) => ({ color })),
        label: p.labels,
        contrast: p.contrast,
        matrix: p.matrix,
      });
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  extraExports: [
    {
      id: "css-variables",
      labelKey: EXTRA_EXPORT_LABELS.cssVariables,
      language: "css",
      render: (p) =>
        cssVariables(
          "palette",
          paletteColors(p).map((color, i) => ({ name: String(i + 1), color })),
        ),
    },
    {
      id: "hex-list",
      labelKey: EXTRA_EXPORT_LABELS.hexList,
      language: "text",
      render: (p) =>
        colorList(
          paletteColors(p).map((color, i) => ({ name: String(i + 1), color })),
          "hex",
        ),
    },
  ],
});
