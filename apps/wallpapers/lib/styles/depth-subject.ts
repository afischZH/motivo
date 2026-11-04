import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { gradientAt, n, presetsFor, shade, smoothPath, stops, svgOpen } from "./shared";

/**
 * Depth subject: one big, clearly separated subject (a peak, a planet or a
 * rainbow arch) that rises from the bottom into the clock zone, in front of
 * a calm sky. Built for lock screens with layered clocks: iOS may place the
 * clock behind such a subject, but only the system decides, so this is a
 * good candidate, not a guarantee.
 */
const ID = "depth-subject";
const SUBJECTS = ["peak", "planet", "arch"] as const;

const schema = z.object({
  subject: z.enum(SUBJECTS),
  skyTop: colorSchema,
  skyBottom: colorSchema,
  /** Subject colours, light to dark. */
  palette: paletteSchema,
  /** How far up the subject reaches, percent of the height from the top. */
  reach: z.number().min(8).max(45),
  sun: z.boolean(),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  subject: "peak",
  skyTop: "#9fc5e8",
  skyBottom: "#fde2c8",
  palette: ["#f4f1ee", "#7d8fa6", "#3e4a61", "#1f2738"],
  reach: 18,
  sun: true,
};

export const depthSubjectTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["alpine", {}, 3],
    [
      "dusk-peak",
      {
        skyTop: "#2b1b4a",
        skyBottom: "#f28a6b",
        palette: ["#ffd3b8", "#a1567a", "#4b2a5c", "#1a1030"],
        reach: 22,
      },
      6,
    ],
    [
      "saturn",
      {
        subject: "planet",
        skyTop: "#05060f",
        skyBottom: "#1b1f3b",
        palette: ["#ffe3b3", "#e0a96d", "#a8653a", "#4d2a1a"],
        reach: 20,
        sun: false,
      },
      4,
    ],
    [
      "ice-world",
      {
        subject: "planet",
        skyTop: "#0e2a47",
        skyBottom: "#5fa8d3",
        palette: ["#ffffff", "#bfe6ff", "#5fa8d3", "#1b4965"],
        reach: 16,
      },
      8,
    ],
    [
      "boho-arch",
      {
        subject: "arch",
        skyTop: "#f6eee3",
        skyBottom: "#f1e1cf",
        palette: ["#e4a77f", "#c8693f", "#8e4a2f", "#d9b48f"],
        reach: 20,
      },
      2,
    ],
    [
      "candy-arch",
      {
        subject: "arch",
        skyTop: "#ffeef6",
        skyBottom: "#e8f3ff",
        palette: ["#ff8fab", "#ffc6a5", "#fff1a8", "#a8e6cf", "#9ec5ff"],
        reach: 14,
        sun: false,
      },
      5,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const night = rng.bool(0.35);
    const subject = rng.pick(SUBJECTS);
    const step = rng.float(15, 45);
    const next: Params = {
      ...current,
      subject,
      skyTop: oklchToHex({ l: night ? 0.18 : 0.85, c: 0.06, h: hue }),
      skyBottom: oklchToHex({ l: night ? 0.45 : 0.93, c: 0.07, h: (hue + 40) % 360 }),
      palette: Array.from({ length: 4 }, (_, i) =>
        oklchToHex({
          l: 0.92 - i * 0.22,
          c: rng.float(0.04, 0.14),
          h: (hue + 180 + i * step) % 360,
        }),
      ),
      reach: rng.int(12, 26),
      sun: rng.bool(0.6),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const top = (h * p.reach) / 100;
      const pal = p.palette.length > 0 ? p.palette : defaults.palette;
      const col = (t: number): string => gradientAt(pal, t);
      const defs: string[] = [
        `<linearGradient id="ds-sky" x1="0" y1="0" x2="0" y2="1">${stops([p.skyTop, p.skyBottom])}</linearGradient>`,
      ];
      const parts: string[] = [`<rect width="${w}" height="${h}" fill="url(#ds-sky)"/>`];
      if (p.sun) {
        const sx = w * rng.float(0.15, 0.85);
        const sy = top + (h - top) * rng.float(0.05, 0.2);
        parts.push(
          `<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(short * 0.2)}" fill="#fff" opacity="0.18"/>`,
          `<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(short * 0.11)}" fill="#fff" opacity="0.6"/>`,
        );
      }

      if (p.subject === "peak") {
        // Ridge from the left edge up to the summit and down to the right edge.
        const apex = w * rng.float(0.4, 0.6);
        const ridge = (from: number, to: number, y0: number, y1: number): [number, number][] => {
          const pts: [number, number][] = [];
          const steps = 9;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const jag = i === 0 || i === steps ? 0 : rng.float(-1, 1) * (h - top) * 0.025;
            pts.push([from + (to - from) * t, y0 + (y1 - y0) * Math.pow(t, 1.25) + jag]);
          }
          return pts;
        };
        const footL = h * rng.float(0.62, 0.72);
        const footR = h * rng.float(0.6, 0.7);
        const left = ridge(apex, -w * 0.05, top, footL).reverse();
        const right = ridge(apex, w * 1.05, top, footR).slice(1);
        const outline = [...left, ...right];
        const body = `M${outline.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}L${n(w * 1.05)} ${h}L${n(-w * 0.05)} ${h}Z`;
        // Shadow side: from the summit down a spur to the right.
        const spur: [number, number][] = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          spur.push([apex + w * 0.12 * t + rng.float(-1, 1) * w * 0.015, top + (h - top) * t]);
        }
        const shadow = `M${spur.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}L${n(w * 1.05)} ${h}L${n(w * 1.05)} ${n(footR)}L${right.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}Z`;
        // Snow cap: the top quarter of the mountain.
        const snowLine = top + (h - top) * 0.2;
        defs.push(
          `<clipPath id="ds-mtn"><path d="${body}"/></clipPath>`,
          `<linearGradient id="ds-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col(0.35)}"/><stop offset="1" stop-color="${col(0.75)}"/></linearGradient>`,
        );
        let snow = "";
        for (let i = 0; i <= 10; i++) {
          const x = -w * 0.05 + (w * 1.1 * i) / 10;
          snow += `${i === 0 ? "M" : "L"}${n(x)} ${n(snowLine + rng.float(-1, 1) * h * 0.03 + Math.abs(x - apex) * 0.25)}`;
        }
        snow += `L${n(w * 1.05)} 0L${n(-w * 0.05)} 0Z`;
        parts.push(
          `<path d="${body}" fill="url(#ds-body)"/>`,
          `<g clip-path="url(#ds-mtn)"><path d="${snow}" fill="${col(0)}"/><path d="${shadow}" fill="${col(1)}" opacity="0.35"/></g>`,
        );
        // Foreground hills, darker and closer.
        for (let k = 0; k < 2; k++) {
          const base = h * (0.78 + k * 0.1);
          const pts: [number, number][] = Array.from({ length: 6 }, (_, i) => [
            -w * 0.1 + (w * 1.2 * i) / 5,
            base + rng.float(-1, 1) * h * 0.04,
          ]);
          parts.push(
            `<path d="${smoothPath(pts)}L${n(w * 1.1)} ${h}L${n(-w * 0.1)} ${h}Z" fill="${shade(col(0.8 + k * 0.2), -0.1 * k)}"/>`,
          );
        }
      } else if (p.subject === "planet") {
        const r = Math.max(w * 0.48, (h - top) * 0.5);
        const cx = w / 2;
        const cy = top + r;
        defs.push(
          `<radialGradient id="ds-planet" cx="0.35" cy="0.25" r="0.85"><stop offset="0" stop-color="${col(0)}"/><stop offset="0.55" stop-color="${col(0.45)}"/><stop offset="1" stop-color="${col(1)}"/></radialGradient>`,
          `<clipPath id="ds-ball"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/></clipPath>`,
        );
        const tilt = rng.float(-18, 18);
        const ring = (half: "back" | "front"): string => {
          const sweep = half === "back" ? 1 : 0;
          const arc = (k: number): string =>
            `M${n(cx - r * k)} ${n(cy)}A${n(r * k)} ${n(r * k * 0.17)} 0 0 ${sweep} ${n(cx + r * k)} ${n(cy)}`;
          return (
            `<g fill="none" transform="rotate(${n(tilt)} ${n(cx)} ${n(cy)})">` +
            `<path d="${arc(1.32)}" stroke="${col(0.05)}" stroke-width="${n(r * 0.09)}" stroke-opacity="0.9"/>` +
            `<path d="${arc(1.18)}" stroke="${col(0.35)}" stroke-width="${n(r * 0.05)}" stroke-opacity="0.8"/></g>`
          );
        };
        let bands = "";
        for (let i = 0; i < 7; i++) {
          const y = cy - r + (2 * r * (i + rng.float(0.2, 0.8))) / 7;
          bands += `<rect x="${n(cx - r)}" y="${n(y)}" width="${n(r * 2)}" height="${n(r * rng.float(0.03, 0.09))}" fill="${col(rng.float(0.1, 0.9))}" opacity="0.35"/>`;
        }
        parts.push(
          ring("back"),
          `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#ds-planet)"/>`,
          `<g clip-path="url(#ds-ball)" transform="rotate(${n(tilt)} ${n(cx)} ${n(cy)})">${bands}</g>`,
          ring("front"),
        );
      } else {
        // Rainbow arch: concentric bands standing on the bottom edge.
        const cx = w / 2;
        const outer = Math.min(h - top, w * 0.75);
        const base = top + outer;
        const count = Math.max(3, pal.length);
        const bandW = outer / (count + 1.2);
        for (let i = 0; i < count; i++) {
          const r = outer - i * bandW;
          parts.push(
            `<path d="M${n(cx - r)} ${n(h)}V${n(base)}A${n(r)} ${n(r)} 0 0 1 ${n(cx + r)} ${n(base)}V${n(h)}Z" fill="${pal[i % pal.length] ?? col(i / count)}"/>`,
          );
        }
        const inner = outer - count * bandW;
        parts.push(
          `<path d="M${n(cx - inner)} ${n(h)}V${n(base)}A${n(inner)} ${n(inner)} 0 0 1 ${n(cx + inner)} ${n(base)}V${n(h)}Z" fill="${p.skyBottom}"/>`,
        );
      }
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
