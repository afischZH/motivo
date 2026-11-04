import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { luminance, n, presetsFor, svgOpen } from "./shared";

/**
 * Risograph: two or three spot inks printed one over the other (multiply),
 * each layer slightly off register, with the speckled ink coverage of a
 * riso print. Bold circles, half circles, bars and stripes.
 */
const ID = "risograph";

const schema = z.object({
  paper: colorSchema,
  palette: paletteSchema,
  shapes: z.int().min(2).max(14),
  /** Misregistration, per mille of the short edge. */
  offset: z.number().min(0).max(30),
  /** Ink speckle 0 to 100. */
  speckle: z.number().min(0).max(100),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  paper: "#f5efe3",
  palette: ["#ff48b0", "#0078bf", "#ffe800"],
  shapes: 6,
  offset: 8,
  speckle: 55,
};

export const risographTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["classic", {}, 2],
    ["sunrise", { palette: ["#ff6c2f", "#765ba7"], shapes: 4, offset: 12 }, 4],
    ["mint", { paper: "#fbf8f1", palette: ["#00a95c", "#ff665e"], shapes: 7 }, 7],
    [
      "night",
      { paper: "#1f1d22", palette: ["#ffe800", "#ff48b0", "#00a9ff"], shapes: 6, speckle: 40 },
      3,
    ],
    [
      "blueprint",
      { paper: "#eef1f4", palette: ["#3255a4", "#ff48b0"], shapes: 9, offset: 5, speckle: 70 },
      9,
    ],
    [
      "bold",
      { paper: "#fff9ef", palette: ["#f15060", "#0078bf", "#ffe800"], shapes: 3, offset: 18 },
      5,
    ],
  ]),
  randomize(rng, current, locks) {
    const inks = [
      "#ff48b0",
      "#0078bf",
      "#ffe800",
      "#00a95c",
      "#ff665e",
      "#765ba7",
      "#f15060",
      "#ff6c2f",
      "#3255a4",
    ];
    const pick: string[] = [];
    const count = rng.int(2, 3);
    while (pick.length < count) {
      const ink = rng.pick(inks);
      if (!pick.includes(ink)) pick.push(ink);
    }
    const next: Params = {
      ...current,
      paper: oklchToHex({ l: 0.96, c: 0.015, h: rng.float(60, 100) }),
      palette: pick,
      shapes: rng.int(3, 9),
      offset: rng.int(4, 16),
      speckle: rng.int(30, 75),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const off = (short * p.offset) / 1000;
      // Speckle: a tile of small paper-coloured dots knocked out of every ink.
      const tile = short / 14;
      const dots: string[] = [];
      const count = Math.round(260 * (p.speckle / 100));
      for (let i = 0; i < count; i++) {
        dots.push(
          `<circle cx="${n(rng.float(0, tile))}" cy="${n(rng.float(0, tile))}" r="${n(tile * rng.float(0.004, 0.016))}"/>`,
        );
      }
      const defs = [
        `<pattern id="rg-speck" width="${n(tile)}" height="${n(tile)}" patternUnits="userSpaceOnUse"><g fill="${p.paper}">${dots.join("")}</g></pattern>`,
      ];
      // Inks multiply on light paper; on dark paper they would vanish, so screen.
      const blend = luminance(p.paper) < 0.5 ? "screen" : "multiply";
      const layers: string[] = [];
      p.palette.forEach((ink, layer) => {
        const shapes: string[] = [];
        for (let i = 0; i < Math.ceil(p.shapes / p.palette.length) + (layer === 0 ? 1 : 0); i++) {
          const x = rng.float(0, w);
          const y = rng.float(0, h);
          const s = short * rng.float(0.25, 0.7);
          switch (rng.int(0, 3)) {
            case 0:
              shapes.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(s / 2)}"/>`);
              break;
            case 1:
              shapes.push(
                `<path d="M${n(x - s / 2)} ${n(y)}A${n(s / 2)} ${n(s / 2)} 0 0 1 ${n(x + s / 2)} ${n(y)}Z" transform="rotate(${rng.pick([0, 90, 180, 270] as const)} ${n(x)} ${n(y)})"/>`,
              );
              break;
            case 2:
              shapes.push(
                `<rect x="${n(x - s)}" y="${n(y - s * 0.12)}" width="${n(s * 2)}" height="${n(s * 0.24)}" transform="rotate(${n(rng.float(-40, 40))} ${n(x)} ${n(y)})"/>`,
              );
              break;
            default: {
              let d = "";
              for (let k = 0; k < 6; k++)
                d += `M${n(x - s / 2)} ${n(y - s / 2 + (k * s) / 6)}h${n(s)}v${n(s / 14)}h${n(-s)}z`;
              shapes.push(
                `<path d="${d}" transform="rotate(${n(rng.float(0, 180))} ${n(x)} ${n(y)})"/>`,
              );
            }
          }
        }
        const dx = rng.float(-off, off);
        const dy = rng.float(-off, off);
        layers.push(
          `<g style="mix-blend-mode:${blend}" transform="translate(${n(dx)} ${n(dy)})"><g fill="${ink}" opacity="0.92">${shapes.join("")}</g>` +
            (p.speckle > 0 ? `<g fill="url(#rg-speck)">${shapes.join("")}</g>` : "") +
            `</g>`,
        );
      });
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs><rect width="${w}" height="${h}" fill="${p.paper}"/>${layers.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
