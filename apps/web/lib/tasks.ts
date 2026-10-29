/**
 * Catalogue by task (W1-AP04): tools grouped by what a web designer wants
 * to make, across the technical categories. Slugs live in `i18n/slugs.ts`
 * (`TASK_SLUGS`), texts under `Tasks.<id>`. `tasks.test.ts` checks that every
 * tool exists, so a renamed or removed tool cannot leave a dead entry.
 */
import { registry, type AnyToolDefinition } from "@musterli/tool-registry";

import { TASK_IDS, type TaskId } from "@/i18n/slugs";

export { TASK_IDS, type TaskId };

/** Tools of each task, the best starting point first. */
export const TASK_TOOLS: Readonly<Record<TaskId, readonly string[]>> = {
  "hero-backgrounds": [
    "mesh-gradient",
    "shader-gradient",
    "blurry-gradient",
    "animated-gradient",
    "blob-composition",
    "perspective-grid",
    "flow-field",
    "topo-lines",
    "low-poly",
    "starry-sky",
    "noise-grain",
  ],
  "surface-patterns": [
    "seamless-patterns",
    "geometric-patterns",
    "css-patterns",
    "polka-dots",
    "grid-patterns",
    "dieter-dots",
    "terrazzo",
    "doodles",
    "guilloche",
    "svg-waves",
  ],
  "ui-effects": [
    "glass-effects",
    "css-shadow",
    "bento-grid",
    "css-gradient",
    "striped-gradient",
    "blob",
  ],
  "color-systems": [
    "palette-generator",
    "tailwind-palette",
    "tints-shades",
    "contrast-checker",
    "palette-from-image",
  ],
  "icons-avatars": ["favicon-generator", "avatar", "placeholder-image", "svg-charts"],
  "image-polish": [
    "screenshot-beautifier",
    "duotone",
    "halftone",
    "fractal-glass",
    "god-rays",
    "dither",
    "pixelate",
  ],
};

/** The registered tools of a task, in task order. */
export function taskTools(task: TaskId): AnyToolDefinition[] {
  return TASK_TOOLS[task].flatMap((id) => registry.get(id) ?? []);
}
