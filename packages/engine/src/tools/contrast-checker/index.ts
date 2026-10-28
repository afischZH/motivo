/**
 * Contrast checker (docs/TOOLS.md F6): a preview card with sample content in
 * the text colour on the background colour, the WCAG 2 results next to it
 * and, optionally, the same card as seen with a colour vision deficiency.
 * With `pairs`, a contrast matrix of a whole palette instead.
 *
 * The SVG contains no words (sample text is Lorem ipsum, results are
 * glyphs, levels and ratios), so it needs no translation and preview, SVG
 * and PNG are identical (one render path).
 */
import { formatNumber } from "../../curves";
import { contrastRatio, formatRatio } from "../../palette/contrast";
import { normalizeHex } from "../../palette/format";
import { contrastText } from "../../palette/swatches";
import { simulateVision, type VisionSimulation } from "../../palette/vision";
import {
  WCAG_CHECKS,
  sampleTargets,
  wcagChecks,
  type ContrastSample,
  type WcagCheckId,
} from "../../palette/wcag";
import { svgDocument } from "../../svg";

export interface ContrastCheckerOptions {
  readonly width: number;
  readonly height: number;
  readonly foreground: string;
  readonly background: string;
  readonly sample: ContrastSample;
  readonly simulation: VisionSimulation;
  /** Shows the contrast matrix of `palette` instead of the card. */
  readonly pairs: boolean;
  readonly palette: readonly string[];
}

const FONT =
  "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
/** Results panel colours: fixed, readable on white (all at least 4.5:1). */
const INK = "#1c1c1e";
const MUTED = "#5f5f66";
const PANEL = "#ffffff";
const PASS = "#15803d";
const FAIL = "#b91c1c";
const RULE = "#e4e4e7";

const f = (v: number): string => formatNumber(v, 2);

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const rect = (b: Box, fill: string, extra = ""): string =>
  `<rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" fill="${fill}"${extra}/>`;

const text = (
  x: number,
  y: number,
  size: number,
  fill: string,
  content: string,
  extra = "",
): string =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" fill="${fill}"${extra}>${content}</text>`;

const BODY_LINES = [
  "Lorem ipsum dolor sit amet,",
  "consectetur adipiscing elit.",
  "Sed do eiusmod tempor",
  "incididunt ut labore et",
  "dolore magna aliqua.",
];

/** Check mark and cross on a unit square, as paths. */
const checkPath = (x: number, y: number, s: number): string =>
  `M${f(x + s * 0.2)} ${f(y + s * 0.52)}L${f(x + s * 0.42)} ${f(y + s * 0.72)}L${f(x + s * 0.8)} ${f(y + s * 0.3)}`;
const crossPath = (x: number, y: number, s: number): string =>
  `M${f(x + s * 0.28)} ${f(y + s * 0.28)}L${f(x + s * 0.72)} ${f(y + s * 0.72)}M${f(x + s * 0.72)} ${f(y + s * 0.28)}L${f(x + s * 0.28)} ${f(y + s * 0.72)}`;

/** Sample content of one card in `fg` on `bg`. */
function sampleCard(b: Box, fg: string, bg: string, sample: ContrastSample): string {
  const u = Math.max(1, Math.min(b.w / 16, b.h / 9));
  const pad = u;
  const x = b.x + pad;
  let out = rect(b, bg);
  if (sample === "heading") {
    const y = b.y + b.h / 2 - 1.3 * u;
    out += text(x, y, 3.2 * u, fg, "Aa", ' font-weight="700"');
    out += text(x, y + 2.1 * u, 1.5 * u, fg, "Lorem ipsum", ' font-weight="700"');
    out += text(x, y + 3.9 * u, 1.5 * u, fg, "dolor sit amet");
  } else if (sample === "body") {
    const fs = 0.78 * u;
    const lead = fs * 1.5;
    let y = b.y + b.h / 2 - ((BODY_LINES.length - 1) * lead) / 2 + fs * 0.35;
    let lines = "";
    for (const line of BODY_LINES) {
      lines += `<tspan x="${f(x)}" y="${f(y)}">${line}</tspan>`;
      y += lead;
    }
    out += `<text font-size="${f(fs)}" fill="${fg}">${lines}</text>`;
  } else {
    const sw = Math.max(1, u * 0.12);
    const cy = b.y + b.h / 2;
    const row1 = cy - 1.9 * u;
    const row2 = cy + 0.5 * u;
    const h = 1.6 * u;
    const r = 0.35 * u;
    // Button: filled with the text colour, label in the background colour.
    out += `<rect x="${f(x)}" y="${f(row1)}" width="${f(5 * u)}" height="${f(h)}" rx="${f(r)}" fill="${fg}"/>`;
    out += text(
      x + 2.5 * u,
      row1 + h / 2 + 0.25 * u,
      0.7 * u,
      bg,
      "Lorem",
      ' text-anchor="middle" font-weight="700"',
    );
    // Text field: outline and placeholder.
    const fx = x + 6 * u;
    out += `<rect x="${f(fx + sw / 2)}" y="${f(row1 + sw / 2)}" width="${f(8 * u - sw)}" height="${f(h - sw)}" rx="${f(r)}" fill="none" stroke="${fg}" stroke-width="${f(sw)}"/>`;
    out += text(fx + 0.5 * u, row1 + h / 2 + 0.25 * u, 0.7 * u, fg, "ipsum");
    // Checkbox (checked), radio (selected), switch (on), all outlined in the text colour.
    const box = h * 0.75;
    const by = row2 + (h - box) / 2;
    out += `<rect x="${f(x + sw / 2)}" y="${f(by + sw / 2)}" width="${f(box - sw)}" height="${f(box - sw)}" rx="${f(r * 0.6)}" fill="none" stroke="${fg}" stroke-width="${f(sw)}"/>`;
    out += `<path d="${checkPath(x, by, box)}" fill="none" stroke="${fg}" stroke-width="${f(sw * 1.4)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const rx = x + 2.4 * u + box / 2;
    out += `<circle cx="${f(rx)}" cy="${f(by + box / 2)}" r="${f(box / 2 - sw / 2)}" fill="none" stroke="${fg}" stroke-width="${f(sw)}"/>`;
    out += `<circle cx="${f(rx)}" cy="${f(by + box / 2)}" r="${f(box / 4)}" fill="${fg}"/>`;
    const tx = x + 4.6 * u;
    const tw = 2.4 * u;
    out += `<rect x="${f(tx + sw / 2)}" y="${f(by + sw / 2)}" width="${f(tw - sw)}" height="${f(box - sw)}" rx="${f(box / 2)}" fill="none" stroke="${fg}" stroke-width="${f(sw)}"/>`;
    out += `<circle cx="${f(tx + tw - box / 2)}" cy="${f(by + box / 2)}" r="${f(box / 2 - sw * 1.8)}" fill="${fg}"/>`;
    // Icon: a simple star outline.
    const sx = x + 8.4 * u + box / 2;
    const sy = by + box / 2;
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rr = i % 2 === 0 ? box * 0.55 : box * 0.24;
      pts.push(`${f(sx + Math.cos(a) * rr)},${f(sy + Math.sin(a) * rr)}`);
    }
    out += `<polygon points="${pts.join(" ")}" fill="none" stroke="${fg}" stroke-width="${f(sw)}" stroke-linejoin="round"/>`;
  }
  return out;
}

/** Eye glyph plus the ratio, bottom right of a simulated card. */
function simulationBadge(b: Box, fg: string, ratio: number): string {
  const u = Math.max(1, Math.min(b.w / 16, b.h / 9));
  const fs = 0.6 * u;
  const label = `${formatRatio(ratio)}:1`;
  const w = 1.4 * u + label.length * fs * 0.62 + 0.6 * u;
  const h = 1.1 * u;
  const x = b.x + b.w - w - 0.6 * u;
  const y = b.y + b.h - h - 0.6 * u;
  const ex = x + 0.75 * u;
  const ey = y + h / 2;
  const sw = Math.max(0.5, u * 0.07);
  return (
    `<g fill="none" stroke="${fg}" stroke-width="${f(sw)}">` +
    `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}"/>` +
    `<path d="M${f(ex - 0.42 * u)} ${f(ey)}Q${f(ex)} ${f(ey - 0.5 * u)} ${f(ex + 0.42 * u)} ${f(ey)}Q${f(ex)} ${f(ey + 0.5 * u)} ${f(ex - 0.42 * u)} ${f(ey)}Z"/>` +
    `</g><circle cx="${f(ex)}" cy="${f(ey)}" r="${f(0.14 * u)}" fill="${fg}"/>` +
    text(x + 1.4 * u, ey + fs * 0.35, fs, fg, label, ' font-weight="600"')
  );
}

/** Glyph of a check row: small "Aa" (normal text), large "Aa" (large text), outlined pill (UI). */
function checkGlyph(id: WcagCheckId, x: number, cy: number, s: number, fill: string): string {
  if (id.startsWith("normal")) return text(x, cy + s * 0.18, s * 0.5, fill, "Aa");
  if (id.startsWith("large"))
    return text(x, cy + s * 0.3, s * 0.85, fill, "Aa", ' font-weight="700"');
  const sw = Math.max(0.5, s * 0.07);
  return `<rect x="${f(x + sw / 2)}" y="${f(cy - s * 0.25)}" width="${f(s * 0.95)}" height="${f(s * 0.5)}" rx="${f(s * 0.25)}" fill="none" stroke="${fill}" stroke-width="${f(sw)}"/>`;
}

const RELEVANT: Readonly<Record<ContrastSample, readonly WcagCheckId[]>> = {
  body: ["normal-aa", "normal-aaa"],
  heading: ["large-aa", "large-aaa"],
  ui: ["ui-aa"],
};

/** Ratio, a colour chip and the five WCAG rows; rows that matter for `sample` stand out. */
function resultsPanel(b: Box, fg: string, bg: string, sample: ContrastSample): string {
  const ratio = contrastRatio(fg, bg);
  const u = Math.max(1, Math.min(b.w / 12, b.h / 13));
  const x = b.x + u;
  let out = rect(b, PANEL);
  let y = b.y + u * 0.9;
  // Chip: the pair itself, then the ratio.
  const chip = 2.6 * u;
  out += `<rect x="${f(x)}" y="${f(y)}" width="${f(chip)}" height="${f(chip)}" rx="${f(u * 0.4)}" fill="${bg}" stroke="${RULE}" stroke-width="${f(Math.max(0.5, u * 0.04))}"/>`;
  out += text(
    x + chip / 2,
    y + chip * 0.66,
    chip * 0.48,
    fg,
    "Aa",
    ' text-anchor="middle" font-weight="700"',
  );
  out += text(
    x + chip + 0.6 * u,
    y + chip * 0.74,
    2 * u,
    INK,
    `${formatRatio(ratio)}:1`,
    ' font-weight="700"',
  );
  y += chip + 0.9 * u;
  out += `<rect x="${f(x)}" y="${f(y)}" width="${f(b.w - 2 * u)}" height="${f(Math.max(0.5, u * 0.05))}" fill="${RULE}"/>`;
  y += 0.5 * u;
  const rowH = (b.y + b.h - u * 0.6 - y) / WCAG_CHECKS.length;
  const s = Math.min(rowH * 0.8, 1.5 * u);
  const relevant = RELEVANT[sample];
  for (const check of wcagChecks(ratio)) {
    const cy = y + rowH / 2;
    const fill = relevant.includes(check.id) ? INK : MUTED;
    const weight = relevant.includes(check.id) ? ' font-weight="700"' : "";
    out += checkGlyph(check.id, x, cy, s, fill);
    const level = check.id.endsWith("aaa") ? "AAA" : "AA";
    out += text(x + 1.6 * s, cy + s * 0.2, s * 0.55, fill, level, weight);
    out += text(x + 3.3 * s, cy + s * 0.2, s * 0.5, fill, `${formatNumber(check.min, 1)}:1`);
    const ix = b.x + b.w - u - s * 0.8;
    const iy = cy - s * 0.4;
    const color = check.pass ? PASS : FAIL;
    out += `<circle cx="${f(ix + s * 0.4)}" cy="${f(cy)}" r="${f(s * 0.4)}" fill="${color}"/>`;
    const d = check.pass ? checkPath(ix, iy, s * 0.8) : crossPath(ix, iy, s * 0.8);
    out += `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="${f(s * 0.09)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    y += rowH;
  }
  return out;
}

/** n × n grid: rows are backgrounds, columns text colours, the diagonal shows the swatch. */
function matrix(b: Box, colors: readonly string[]): string {
  const n = colors.length;
  const cw = b.w / n;
  const ch = b.h / n;
  const fs = Math.max(1, Math.min((cw * 0.84) / (10 * 0.62), ch * 0.22));
  let rects = "";
  let texts = "";
  for (let row = 0; row < n; row++) {
    const bg = colors[row] as string;
    const y = b.y + row * ch;
    rects += rect({ x: b.x, y, w: b.w, h: ch }, bg);
    for (let col = 0; col < n; col++) {
      if (row === col) continue;
      const fg = colors[col] as string;
      const cx = b.x + col * cw + cw / 2;
      texts +=
        text(cx, y + ch / 2 - fs * 0.15, fs * 1.4, fg, "Aa", ' font-weight="700"') +
        text(cx, y + ch / 2 + fs * 1.25, fs, fg, contrastText(contrastRatio(bg, fg)));
    }
  }
  return `<g shape-rendering="crispEdges">${rects}</g><g text-anchor="middle">${texts}</g>`;
}

/** The preview card (or matrix) as an SVG document. */
export function contrastCheckerSvg(o: ContrastCheckerOptions): string {
  const { width, height } = o;
  const fg = normalizeHex(o.foreground);
  const bg = normalizeHex(o.background);
  let body: string;
  if (o.pairs) {
    const colors = o.palette.map((c) => simulateVision(normalizeHex(c), o.simulation));
    body = matrix({ x: 0, y: 0, w: width, h: height }, colors);
  } else {
    const landscape = width >= height;
    const sample: Box = landscape
      ? { x: 0, y: 0, w: width * 0.62, h: height }
      : { x: 0, y: 0, w: width, h: height * 0.6 };
    const results: Box = landscape
      ? { x: sample.w, y: 0, w: width - sample.w, h: height }
      : { x: 0, y: sample.h, w: width, h: height - sample.h };
    if (o.simulation === "none") {
      body = sampleCard(sample, fg, bg, o.sample);
    } else {
      const half = sample.h / 2;
      const top: Box = { ...sample, h: half };
      const bottom: Box = { ...sample, y: sample.y + half, h: sample.h - half };
      const sfg = simulateVision(fg, o.simulation);
      const sbg = simulateVision(bg, o.simulation);
      body =
        sampleCard(top, fg, bg, o.sample) +
        sampleCard(bottom, sfg, sbg, o.sample) +
        simulationBadge(bottom, sfg, contrastRatio(sfg, sbg));
    }
    body += resultsPanel(results, fg, bg, o.sample);
  }
  return svgDocument(width, height, `<g font-family="${FONT}">${body}</g>`);
}

const LEVEL_NAMES: Readonly<Record<WcagCheckId, string>> = {
  "normal-aa": "Normal text   AA ",
  "normal-aaa": "Normal text   AAA",
  "large-aa": "Large text    AA ",
  "large-aaa": "Large text    AAA",
  "ui-aa": "UI components AA ",
};

/**
 * Plain-text report (English, like the code exports): colours, ratio
 * (rounded down) and every WCAG 2 level with its threshold.
 */
export function contrastReport(o: Omit<ContrastCheckerOptions, "width" | "height">): string {
  const lines: string[] = ["Contrast check (WCAG 2.2)", ""];
  const pairLines = (fg: string, bg: string): string[] => {
    const ratio = contrastRatio(fg, bg);
    return [
      `Text color:    ${fg}`,
      `Background:    ${bg}`,
      `Contrast:      ${formatRatio(ratio)}:1`,
      ...wcagChecks(ratio).map(
        (c) =>
          `${LEVEL_NAMES[c.id]}  ${`${formatNumber(c.min, 1)}:1`.padEnd(6)}  ${c.pass ? "pass" : "fail"}`,
      ),
    ];
  };
  const fg = normalizeHex(o.foreground);
  const bg = normalizeHex(o.background);
  lines.push(...pairLines(fg, bg));
  const targets = sampleTargets(o.sample);
  lines.push(
    "",
    `Sample:        ${o.sample} (AA from ${formatNumber(targets.aa, 1)}:1${
      targets.aaa === null ? "" : `, AAA from ${formatNumber(targets.aaa, 1)}:1`
    })`,
  );
  if (o.simulation !== "none") {
    const sfg = simulateVision(fg, o.simulation);
    const sbg = simulateVision(bg, o.simulation);
    lines.push(
      `Simulation:    ${o.simulation} (Machado, Oliveira, Fernandes 2009)`,
      `  seen as text ${sfg} on ${sbg}, ${formatRatio(contrastRatio(sfg, sbg))}:1`,
    );
  }
  if (o.pairs) {
    lines.push("", "Palette pairs (text on background):");
    const colors = o.palette.map(normalizeHex);
    for (const bgc of colors) {
      for (const fgc of colors) {
        if (fgc === bgc) continue;
        lines.push(`  ${fgc} on ${bgc}  ${contrastText(contrastRatio(fgc, bgc))}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
