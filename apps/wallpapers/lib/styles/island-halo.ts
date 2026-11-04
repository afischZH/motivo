import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { gradientAt, n, presetsFor, stops, svgOpen } from "./shared";

/**
 * Island halo: artwork that frames the front camera instead of fighting it.
 * The light source sits where the camera usually is: the Dynamic Island or
 * punch hole on tall phones (top centre, about 3.5 % down), the bezel or
 * notch on tablets and laptops (top edge). The generator only knows the
 * canvas size, so the position is estimated from the aspect ratio.
 */
const ID = "island-halo";

const MODES = ["corona", "ripples", "beam"] as const;

const schema = z.object({
  backgroundTop: colorSchema,
  backgroundBottom: colorSchema,
  palette: paletteSchema,
  mode: z.enum(MODES),
  rings: z.int().min(3).max(40),
  /** Glow strength 0 to 100. */
  intensity: z.number().min(0).max(100),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  backgroundTop: "#05060f",
  backgroundBottom: "#120a2a",
  palette: ["#ffffff", "#ffb86b", "#ff4d8d", "#5b4bff"],
  mode: "corona",
  rings: 14,
  intensity: 70,
};

/** The camera spot: centre and the island's size, in pixels. */
export function cameraSpot(w: number, h: number): { x: number; y: number; rx: number; ry: number } {
  if (h / w > 1.7) {
    // Tall phones: Dynamic Island / punch hole.
    const ry = h * 0.0215;
    return { x: w / 2, y: h * 0.035, rx: w * 0.16, ry };
  }
  // Tablets, laptops, monitors: camera in the bezel or notch at the top edge.
  const r = Math.min(w, h) * 0.02;
  return { x: w / 2, y: 0, rx: r * (w > h ? 4 : 1), ry: r };
}

export const islandHaloTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["corona", {}, 1],
    [
      "ripples",
      {
        backgroundTop: "#001018",
        backgroundBottom: "#00202a",
        palette: ["#bffcff", "#2ee6d6", "#0077ff"],
        mode: "ripples",
        rings: 22,
      },
      2,
    ],
    [
      "spotlight",
      {
        backgroundTop: "#0a0a0a",
        backgroundBottom: "#1a1a1a",
        palette: ["#fff6dc", "#ffcf7a"],
        mode: "beam",
        intensity: 60,
      },
      3,
    ],
    [
      "eclipse",
      {
        backgroundTop: "#000000",
        backgroundBottom: "#000000",
        palette: ["#ffffff", "#ffd27a", "#ff7a2f"],
        mode: "corona",
        rings: 30,
        intensity: 90,
      },
      4,
    ],
    [
      "sonar",
      {
        backgroundTop: "#f3f1ec",
        backgroundBottom: "#e3ded3",
        palette: ["#ff5a36", "#1f1f1f"],
        mode: "ripples",
        rings: 16,
        intensity: 40,
      },
      5,
    ],
    [
      "aurora-beam",
      {
        backgroundTop: "#030716",
        backgroundBottom: "#071f2a",
        palette: ["#e8fff6", "#5cffc8", "#7a5cff"],
        mode: "beam",
        rings: 8,
        intensity: 80,
      },
      6,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const light = rng.bool(0.2);
    const count = rng.int(2, 4);
    const next: Params = {
      ...current,
      backgroundTop: oklchToHex({ l: light ? 0.96 : 0.08, c: 0.02, h: hue }),
      backgroundBottom: oklchToHex({ l: light ? 0.9 : 0.16, c: 0.05, h: (hue + 30) % 360 }),
      palette: Array.from({ length: count }, (_, i) =>
        oklchToHex({
          l: i === 0 ? 0.97 : rng.float(0.6, 0.8),
          c: i === 0 ? 0.03 : rng.float(0.13, 0.2),
          h: (hue + i * 50) % 360,
        }),
      ),
      mode: MODES[rng.int(0, MODES.length - 1)] ?? "corona",
      rings: rng.int(8, 26),
      intensity: rng.int(45, 90),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const spot = cameraSpot(w, h);
      const reach = Math.hypot(Math.max(spot.x, w - spot.x), h - spot.y);
      const k = p.intensity / 100;
      const defs: string[] = [
        `<linearGradient id="ih-bg" x1="0" y1="0" x2="0" y2="1">${stops([p.backgroundTop, p.backgroundBottom])}</linearGradient>`,
      ];
      const body: string[] = [`<rect width="${w}" height="${h}" fill="url(#ih-bg)"/>`];
      const glowStops = p.palette
        .map((c, i, all) => {
          const t = i / Math.max(1, all.length - 1);
          const o = k * (1 - t) ** 1.4;
          return `<stop offset="${n(t * 0.9)}" stop-color="${c}" stop-opacity="${n(o)}"/>`;
        })
        .join("");
      defs.push(
        `<radialGradient id="ih-glow" gradientUnits="userSpaceOnUse" cx="${n(spot.x)}" cy="${n(spot.y)}" r="${n(reach * 0.75)}">` +
          `${glowStops}<stop offset="1" stop-color="${p.palette.at(-1) ?? "#000"}" stop-opacity="0"/></radialGradient>`,
      );

      if (p.mode === "beam") {
        const spread = w * 0.75;
        defs.push(
          `<linearGradient id="ih-beam" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="${p.palette[0] ?? "#fff"}" stop-opacity="${n(0.55 * k)}"/>` +
            `<stop offset="0.6" stop-color="${p.palette[1] ?? "#fff"}" stop-opacity="${n(0.12 * k)}"/>` +
            `<stop offset="1" stop-color="${p.palette[1] ?? "#fff"}" stop-opacity="0"/></linearGradient>`,
        );
        // Three nested cones, narrower ones brighter.
        for (const f of [1, 0.6, 0.3]) {
          body.push(
            `<path d="M${n(spot.x - spot.rx * 0.6)} ${n(spot.y)}L${n(spot.x + spot.rx * 0.6)} ${n(spot.y)}` +
              `L${n(spot.x + spread * f)} ${h}L${n(spot.x - spread * f)} ${h}Z" fill="url(#ih-beam)"/>`,
          );
        }
        body.push(`<rect width="${w}" height="${h}" fill="url(#ih-glow)" opacity="0.6"/>`);
      } else {
        body.push(`<rect width="${w}" height="${h}" fill="url(#ih-glow)"/>`);
      }

      if (p.mode === "corona") {
        // Fine rays of light, longer and shorter, around the island.
        const rays = p.rings * 10;
        const ray: string[] = [];
        for (let i = 0; i < rays; i++) {
          const a = (i / rays) * Math.PI * 2 + rng.float(-0.03, 0.03);
          const len = reach * rng.float(0.08, 0.42) * k;
          const width = rng.float(0.002, 0.006);
          const x0 = spot.x + Math.cos(a) * spot.rx;
          const y0 = spot.y + Math.sin(a) * spot.ry;
          const x1 = x0 + Math.cos(a - width) * len;
          const y1 = y0 + Math.sin(a - width) * len;
          const x2 = x0 + Math.cos(a + width) * len;
          const y2 = y0 + Math.sin(a + width) * len;
          ray.push(`M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}Z`);
        }
        defs.push(
          `<radialGradient id="ih-ray" gradientUnits="userSpaceOnUse" cx="${n(spot.x)}" cy="${n(spot.y)}" r="${n(reach * 0.6)}">` +
            `<stop offset="0" stop-color="${p.palette[0] ?? "#fff"}" stop-opacity="0.5"/>` +
            `<stop offset="1" stop-color="${p.palette[1] ?? "#fff"}" stop-opacity="0"/></radialGradient>`,
        );
        body.push(`<path d="${ray.join("")}" fill="url(#ih-ray)" style="mix-blend-mode:screen"/>`);
      }

      {
        // Rings around the island: denser near it, fading outward.
        const rings: string[] = [];
        const count = p.mode === "ripples" ? p.rings : Math.round(p.rings / 3);
        const stroke = Math.max(1, Math.min(w, h) * 0.0016);
        for (let i = 1; i <= count; i++) {
          const t = i / count;
          const grow = reach * (p.mode === "ripples" ? t ** 1.35 : t ** 1.6 * 0.5);
          const color = gradientAt(p.palette, t);
          const opacity = (p.mode === "ripples" ? 0.85 : 0.4) * k * (1 - t) ** 0.8;
          rings.push(
            `<rect x="${n(spot.x - spot.rx - grow)}" y="${n(spot.y - spot.ry - grow)}" ` +
              `width="${n((spot.rx + grow) * 2)}" height="${n((spot.ry + grow) * 2)}" rx="${n(spot.ry + grow)}" ` +
              `fill="none" stroke="${color}" stroke-opacity="${n(opacity)}" stroke-width="${n(stroke * (1 + (1 - t) * 1.5))}"/>`,
          );
        }
        body.push(rings.join(""));
      }

      // The island itself: black, with a thin bright edge (the "eclipse").
      body.push(
        `<rect x="${n(spot.x - spot.rx)}" y="${n(spot.y - spot.ry)}" width="${n(spot.rx * 2)}" height="${n(spot.ry * 2)}" ` +
          `rx="${n(spot.ry)}" fill="#000" stroke="${p.palette[0] ?? "#fff"}" stroke-opacity="${n(0.5 * k)}" ` +
          `stroke-width="${n(Math.max(1, spot.ry * 0.08))}"/>`,
      );
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${body.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
