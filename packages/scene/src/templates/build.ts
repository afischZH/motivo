/**
 * Compact builders for template data: boxes in pixels of the native
 * format, everything else with defaults. Constraints are inferred from
 * where a layer sits (as when the user places it) unless a template sets
 * them; group constraints come from the box around their members.
 */
import { inferConstraints } from "../constraints";
import { fontFamilyFor, libraryFont, libraryFontRef } from "../fonts";
import { sceneFormat } from "../formats";
import { boundsOf, frameOf, unionBoxes } from "../geometry";
import type {
  ColorRef,
  Constraints,
  FontRole,
  Layer,
  LogoLayer,
  SceneFormat,
  SceneGroup,
  ShapeLayer,
  TextEffects,
  TextLayer,
} from "../schema";
import type { SceneTemplate, TemplateBackground, TemplateTheme } from "./types";

interface Frame {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  /** Overrides of the inferred constraints. */
  c?: Partial<Constraints>;
  group?: string;
  locked?: boolean;
}

export interface TextSpec extends Frame {
  role: FontRole;
  /** Library font id. */
  font: string;
  size: number;
  /** Smallest size Magic Resize may shrink to; default half the size. */
  min?: number;
  weight?: number;
  italic?: boolean;
  lh?: number;
  /** Letter spacing in em. */
  ls?: number;
  align?: TextLayer["align"];
  valign?: TextLayer["valign"];
  color: ColorRef;
  effects?: TextEffects;
}

export interface ShapeSpec extends Frame {
  fill?: ColorRef | null;
  stroke?: ColorRef | null;
  sw?: number;
  r?: number;
}

/**
 * Logo slot of a template: a neutral mark, hidden until Brand-Apply puts
 * the brand kit's logo in (or the user shows it). Drawn for Musterli.
 */
export const LOGO_PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 96" width="240" height="96">' +
  '<rect width="240" height="96" rx="20" fill="#94a3b8" fill-opacity="0.35"/>' +
  '<circle cx="48" cy="48" r="22" fill="#64748b"/>' +
  '<rect x="86" y="36" width="120" height="24" rx="12" fill="#64748b"/></svg>';

export interface Builder {
  format: SceneFormat;
  text(spec: TextSpec): TextLayer;
  rect(spec: ShapeSpec): ShapeLayer;
  ellipse(spec: ShapeSpec): ShapeLayer;
  line(spec: ShapeSpec & { color: ColorRef }): ShapeLayer;
  shape(spec: ShapeSpec & { shapeId: string }): ShapeLayer;
  logo(spec: Omit<Frame, "id"> & { id?: string }): LogoLayer;
}

function base(f: SceneFormat, s: Frame) {
  const box = { x: s.x, y: s.y, width: s.w, height: s.h };
  const inferred = inferConstraints(box, f, s.c?.bleed ?? false);
  return {
    id: s.id,
    name: "",
    visible: true,
    locked: s.locked ?? false,
    opacity: s.opacity ?? 1,
    rotation: s.rotation ?? 0,
    ...box,
    groupId: s.group ?? null,
    constraints: { ...inferred, ...s.c },
  };
}

export function builder(formatId: string): Builder {
  const f = sceneFormat(formatId);
  if (f.id !== formatId) throw new Error(`Unknown format ${formatId}`);
  const shape = (kind: ShapeLayer["shape"], s: ShapeSpec, shapeId: string | null = null) =>
    ({
      ...base(f, s),
      kind: "shape",
      shape: kind,
      shapeId,
      fill: s.fill === undefined ? null : s.fill,
      stroke: s.stroke ?? null,
      strokeWidth: s.sw ?? 0,
      cornerRadius: s.r ?? 0,
    }) satisfies ShapeLayer;
  return {
    format: f,
    text(s) {
      const font = libraryFontRef(s.font);
      if (!libraryFont(s.font)) throw new Error(`Unknown font ${s.font}`);
      return {
        ...base(f, s),
        kind: "text",
        text: "",
        fontFamily: fontFamilyFor(font),
        font,
        fontRole: s.role,
        fontSize: s.size,
        minFontSize: s.min ?? Math.max(8, Math.round(s.size * 0.5)),
        fontWeight: s.weight ?? 700,
        fontStyle: s.italic ? "italic" : "normal",
        lineHeight: s.lh ?? 1.15,
        letterSpacing: s.ls ?? 0,
        align: s.align ?? "left",
        valign: s.valign ?? "top",
        color: s.color,
        effects: s.effects ?? {},
        placeholder: true,
      };
    },
    rect: (s) => shape("rect", s),
    ellipse: (s) => shape("ellipse", s),
    line: (s) => shape("line", { ...s, fill: null, stroke: s.color, sw: s.sw ?? 6 }),
    shape: (s) => shape("library", s, s.shapeId),
    logo(s) {
      return {
        ...base(f, { ...s, id: s.id ?? "logo" }),
        visible: false,
        kind: "logo",
        assetId: null,
        image: { kind: "svg", svg: LOGO_PLACEHOLDER_SVG, width: 240, height: 96, name: "" },
      };
    },
  };
}

export interface TemplateSpec {
  id: string;
  theme: TemplateTheme;
  format: string;
  palette: readonly string[];
  background: TemplateBackground;
  layers(b: Builder): Layer[];
  /** Group ids; constraints from the box around the members unless given. */
  groups?: readonly (string | { id: string; c: Partial<Constraints> })[];
}

export function template(spec: TemplateSpec): SceneTemplate {
  const b = builder(spec.format);
  // Group ids get a prefix, so a group may share its name with a layer.
  const layers = spec
    .layers(b)
    .map((l) => (l.groupId === null ? l : { ...l, groupId: `g-${l.groupId}` }));
  const groups: SceneGroup[] = (spec.groups ?? []).map((g) => {
    const id = `g-${typeof g === "string" ? g : g.id}`;
    const box = unionBoxes(layers.filter((l) => l.groupId === id).map((l) => boundsOf(frameOf(l))));
    if (!box) throw new Error(`Empty group ${id} in ${spec.id}`);
    const inferred = inferConstraints(box, b.format);
    return { id, name: "", constraints: { ...inferred, ...(typeof g === "string" ? {} : g.c) } };
  });
  return {
    id: spec.id,
    theme: spec.theme,
    format: spec.format,
    palette: spec.palette,
    background: spec.background,
    layers,
    groups,
  };
}
