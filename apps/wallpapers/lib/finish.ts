import type { SafeZone } from "@musterli/devices";
import { svgToDataUri } from "@musterli/exporters";
import { createRenderContext, registry } from "@musterli/tool-registry";

/**
 * Finish layers on top of any generator (T2): grain, dimming and a calm,
 * slightly darker area behind the lock-screen clock. They are composed as
 * one SVG around the generator's SVG, so preview and export still share a
 * single render path. Each layer is an `<image>` of its own document, which
 * keeps the generators' ids apart.
 */
export interface Finish {
  /** Grain strength 0 to 100 (0 = off). */
  readonly grain: number;
  /** Darkening 0 to 80 percent (0 = off). */
  readonly dim: number;
  /** Darken softly behind the clock and widgets, for legible time. */
  readonly calmClock: boolean;
}

export const NO_FINISH: Finish = { grain: 0, dim: 0, calmClock: false };
export const DIM_MAX = 80;
/** Extra darkening of the dark version of a light/dark pair. */
export const DARK_PAIR_DIM = 45;

export function clampFinish(finish: Finish): Finish {
  const clamp = (v: number, max: number) =>
    Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0;
  return {
    grain: clamp(finish.grain, 100),
    dim: clamp(finish.dim, DIM_MAX),
    calmClock: finish.calmClock,
  };
}

export function isPlainFinish(finish: Finish): boolean {
  return finish.grain === 0 && finish.dim === 0 && !finish.calmClock;
}

/** The dark version of a light/dark pair: the same wallpaper, dimmed further. */
export function darkVersion(finish: Finish): Finish {
  return { ...finish, dim: Math.min(DIM_MAX, finish.dim + DARK_PAIR_DIM) };
}

function grainSvg(seed: number, size: { width: number; height: number }, amount: number): string {
  const tool = registry.get("noise-grain");
  if (tool?.render.kind !== "svg") return "";
  const params = {
    ...(tool.defaults as Record<string, unknown>),
    base: "none",
    amount,
    mono: true,
  };
  return tool.render.render(params, createRenderContext(seed, size));
}

const n = (value: number) => Number(value.toFixed(3)).toString();

/**
 * Wraps the generator SVG with the finish. Returns the input unchanged for a
 * plain finish (no extra decode step for the common case).
 */
export function composeWallpaper(
  base: string,
  size: { width: number; height: number },
  seed: number,
  finish: Finish,
  zones: readonly SafeZone[],
): string {
  if (isPlainFinish(finish)) return base;
  const { width: w, height: h } = size;
  const layers: string[] = [`<image width="${w}" height="${h}" href="${svgToDataUri(base)}"/>`];
  const defs: string[] = [];

  if (finish.grain > 0) {
    const grain = grainSvg(seed, size, finish.grain);
    if (grain) {
      layers.push(
        `<image width="${w}" height="${h}" href="${svgToDataUri(grain)}" style="mix-blend-mode:overlay"/>`,
      );
    }
  }
  if (finish.dim > 0) {
    layers.push(`<rect width="${w}" height="${h}" fill="#000" opacity="${n(finish.dim / 100)}"/>`);
  }
  const clock = zones.find((zone) => zone.kind === "clock");
  if (finish.calmClock && clock) {
    // From the top edge down to a bit below the clock area, fading out.
    const bottom = Math.min(1, clock.rect.y + clock.rect.height * 1.4);
    defs.push(
      `<linearGradient id="wp-calm" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="#000" stop-opacity="0.38"/>` +
        `<stop offset="0.7" stop-color="#000" stop-opacity="0.22"/>` +
        `<stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`,
    );
    layers.push(`<rect width="${w}" height="${n(h * bottom)}" fill="url(#wp-calm)"/>`);
  }

  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  return `${head}${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${layers.join("")}</svg>`;
}
