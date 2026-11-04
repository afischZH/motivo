import { mixHex, oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, svgOpen } from "./shared";

/**
 * CRT: an old phosphor monitor. Lines of terminal text, an oscilloscope
 * trace or a radar sweep, fine scanlines, a brighter rolling band and a vignette that hints
 * at the curved glass. Glow comes from stacked strokes, not blur.
 */
const ID = "crt";
const CONTENT = ["text", "wave", "grid"] as const;

const schema = z.object({
  background: colorSchema,
  phosphor: colorSchema,
  content: z.enum(CONTENT),
  /** Scanlines across the short edge. */
  lines: z.int().min(60).max(400),
  /** Brightness 0 to 100. */
  brightness: z.number().min(10).max(100),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#020703",
  phosphor: "#33ff66",
  content: "wave",
  lines: 180,
  brightness: 70,
};

export const crtTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["oscilloscope", {}, 1],
    ["amber", { background: "#0a0500", phosphor: "#ffb000", content: "text", lines: 160 }, 2],
    ["radar", { background: "#000805", phosphor: "#00ffc8", content: "grid", lines: 220 }, 3],
    ["ice", { background: "#00030a", phosphor: "#7ad7ff", content: "wave", brightness: 85 }, 4],
    ["magenta", { background: "#08000a", phosphor: "#ff4fd8", content: "text", lines: 260 }, 5],
    [
      "mono",
      { background: "#050505", phosphor: "#e8e8e8", content: "grid", lines: 120, brightness: 50 },
      6,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const next: Params = {
      ...current,
      background: oklchToHex({ l: 0.07, c: 0.02, h: hue }),
      phosphor: oklchToHex({ l: rng.float(0.78, 0.9), c: rng.float(0.12, 0.22), h: hue }),
      content: rng.pick(CONTENT),
      lines: rng.int(120, 280),
      brightness: rng.int(50, 90),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const k = p.brightness / 100;
      const dim = mixHex(p.background, p.phosphor, 0.35, "oklab");
      const defs: string[] = [
        `<radialGradient id="crt-glow" cx="0.5" cy="0.5" r="0.7"><stop offset="0" stop-color="${p.phosphor}" stop-opacity="${n(0.55 * k)}"/><stop offset="1" stop-color="${p.phosphor}" stop-opacity="0"/></radialGradient>`,
        `<radialGradient id="crt-vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.75"/></radialGradient>`,
        `<linearGradient id="crt-roll" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.phosphor}" stop-opacity="0"/><stop offset="0.5" stop-color="${p.phosphor}" stop-opacity="${n(0.14 * k)}"/><stop offset="1" stop-color="${p.phosphor}" stop-opacity="0"/></linearGradient>`,
      ];
      const body: string[] = [
        `<rect width="${w}" height="${h}" fill="${p.background}"/>`,
        `<rect width="${w}" height="${h}" fill="url(#crt-glow)"/>`,
      ];
      const glowLine = (d: string, width: number): string =>
        [8, 4, 2, 1]
          .map(
            (f, i) =>
              `<path d="${d}" fill="none" stroke="${i === 3 ? mixHex(p.phosphor, "#ffffff", 0.5, "oklab") : p.phosphor}" stroke-opacity="${n(i === 3 ? k : 0.12 * k * (i + 1))}" stroke-width="${n(width * f)}" stroke-linecap="round" stroke-linejoin="round"/>`,
          )
          .join("");

      if (p.content === "text") {
        // Rows of glowing blocks like a terminal, starting below the clock on phones.
        const row = short / 26;
        const top = h > w ? h * 0.36 : h * 0.14;
        const left = w * 0.08;
        let d = "";
        for (let y = top; y < h * 0.9; y += row * 1.6) {
          let x = left + (rng.bool(0.3) ? row * 1.5 : 0);
          const end = left + (w - left * 2) * rng.float(0.2, 1);
          while (x < end) {
            const word = row * 0.55 * rng.int(2, 9);
            d += `M${n(x)} ${n(y)}h${n(Math.min(word, end - x))}`;
            x += word + row * 0.55;
          }
          if (rng.bool(0.15)) y += row * 1.6;
        }
        body.push(glowLine(d, (row * 0.55) / 2));
      } else if (p.content === "wave") {
        const mid = h * (h > w ? 0.6 : 0.5);
        const amp = short * 0.16;
        const f1 = rng.float(1.5, 3.5);
        const f2 = rng.float(5, 9);
        const phase = rng.float(0, Math.PI * 2);
        const pts: string[] = [];
        for (let i = 0; i <= 240; i++) {
          const t = i / 240;
          const env = Math.sin(t * Math.PI);
          const y =
            mid +
            amp *
              env *
              (Math.sin(t * f1 * Math.PI * 2 + phase) * 0.75 +
                Math.sin(t * f2 * Math.PI * 2) * 0.25);
          pts.push(`${i ? "L" : "M"}${n(t * w)} ${n(y)}`);
        }
        body.push(glowLine(pts.join(""), short * 0.004));
      } else if (p.content === "grid") {
        const cx = w / 2;
        const cy = h * (h > w ? 0.6 : 0.5);
        const r = short * 0.42;
        let d = "";
        for (let i = 1; i <= 4; i++)
          d += `M${n(cx - (r * i) / 4)} ${n(cy)}a${n((r * i) / 4)} ${n((r * i) / 4)} 0 1 0 ${n((r * i) / 2)} 0a${n((r * i) / 4)} ${n((r * i) / 4)} 0 1 0 ${n((-r * i) / 2)} 0`;
        d += `M${n(cx - r)} ${n(cy)}H${n(cx + r)}M${n(cx)} ${n(cy - r)}V${n(cy + r)}`;
        body.push(
          `<path d="${d}" fill="none" stroke="${dim}" stroke-width="${n(short * 0.002)}"/>`,
        );
        const sweep = rng.float(0, Math.PI * 2);
        body.push(
          glowLine(
            `M${n(cx)} ${n(cy)}L${n(cx + Math.cos(sweep) * r)} ${n(cy + Math.sin(sweep) * r)}`,
            short * 0.004,
          ),
        );
        for (let i = 0; i < 6; i++) {
          const a = rng.float(0, Math.PI * 2);
          const rr = rng.float(0.15, 0.95) * r;
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          body.push(glowLine(`M${n(x)} ${n(y)}h0.01`, short * 0.006));
        }
      }

      // Rolling band and scanlines.
      const bandY = h * rng.float(0.1, 0.7);
      body.push(
        `<rect y="${n(bandY)}" width="${w}" height="${n(h * 0.25)}" fill="url(#crt-roll)"/>`,
      );
      const gap = short / p.lines;
      defs.push(
        `<pattern id="crt-scan" width="${n(w)}" height="${n(gap)}" patternUnits="userSpaceOnUse"><rect width="${n(w)}" height="${n(gap * 0.45)}" fill="#000" opacity="0.45"/></pattern>`,
      );
      body.push(
        `<rect width="${w}" height="${h}" fill="url(#crt-scan)"/>`,
        `<rect width="${w}" height="${h}" fill="url(#crt-vig)"/>`,
      );
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${body.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
