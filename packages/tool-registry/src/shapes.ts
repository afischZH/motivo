/**
 * Control helpers for tools that pick shapes from the library in
 * `@musterli/engine` (M4-AP01): option labels, pack groups for the
 * thumbnail picker and a small preview. Shape and pack names live in the
 * web app messages under `Shapes.names.<id>` and `Shapes.packs.<id>`.
 */
import { SHAPE_IDS, isShapeId, listShapePacks, shapeLayers, type ShapeId } from "@musterli/engine";
import type { OptionGroup } from "./types";

/** i18n key of a shape name. */
export const shapeLabelKey = (id: string): string => `Shapes.names.${id}`;

/** i18n key of a pack name. */
export const shapePackLabelKey = (id: string): string => `Shapes.packs.${id}`;

/** Option label keys of every library shape (for `ControlHint.optionLabelKeys`). */
export const SHAPE_OPTION_LABEL_KEYS: Readonly<Record<string, string>> = Object.fromEntries(
  SHAPE_IDS.map((id) => [id, shapeLabelKey(id)]),
);

/** The packs as thumbnail picker groups (for `ControlHint.optionGroups`). */
export function shapePackGroups(only?: readonly ShapeId[]): OptionGroup[] {
  const allowed = only ? new Set<string>(only) : null;
  return listShapePacks()
    .map((p) => ({
      id: p.id,
      labelKey: shapePackLabelKey(p.id),
      values: allowed ? p.shapes.filter((s) => allowed.has(s)) : p.shapes,
    }))
    .filter((g) => g.values.length > 0);
}

/** Keeps a colour value safe for an attribute (hex colours and names only). */
const safeColor = (v: string): string => v.replace(/[^#0-9a-zA-Z]/g, "");

/**
 * Preview of one shape as a small SVG for the thumbnail picker: the shape
 * in `fill` (accent layer at 50 % opacity) on `background` ("transparent"
 * for none). Cheap: paths are cached in the engine.
 */
export function shapePreview(
  value: string | number,
  fill: string,
  background: string,
): { readonly svg: string } {
  const id = isShapeId(String(value)) ? String(value) : "circle";
  const { primary, accent } = shapeLayers(id);
  const color = safeColor(fill);
  const bg =
    background === "transparent"
      ? ""
      : `<rect x="-60" y="-60" width="120" height="120" fill="${safeColor(background)}"/>`;
  const second = accent ? `<path d="${accent}" fill="${color}" fill-opacity=".5"/>` : "";
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="-60 -60 120 120">${bg}<path d="${primary}" fill="${color}"/>${second}</svg>`,
  };
}
