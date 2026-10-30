/**
 * Code screenshots (docs/TOOLS.md M6): code with syntax colours in a
 * self-drawn editor window over a backdrop the caller renders (any Musterli
 * background). Monospace layout without a DOM: every character is 0.6 em
 * wide, which matches the common monospace fonts closely; the window is
 * sized from that and scaled down when it would not fit.
 */
import { formatNumber } from "../../curves";
import { escapeXml, stableId, svgDocument } from "../../svg";
import { WINDOW_BUTTON_COLORS, roundedRectPath } from "../screenshot-beautifier";
import { tokenLines, tokenize, type CodeLanguage, type TokenKind } from "./highlight";

export * from "./highlight";

export const CODE_THEMES = ["midnight", "paper", "dusk", "ocean", "forest", "mono"] as const;
export type CodeTheme = (typeof CODE_THEMES)[number];

export const CODE_FRAMES = ["window", "none"] as const;
export type CodeFrame = (typeof CODE_FRAMES)[number];

/** Most lines drawn; more are cut with a note line. */
export const CODE_MAX_LINES = 80;
/** Longest drawn line in characters; longer lines end with an ellipsis. */
export const CODE_MAX_COLUMNS = 160;
/** Tabs become this many spaces. */
const TAB = "  ";

export const CODE_FONT_STACK =
  "ui-monospace, 'SF Mono', 'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace";

/** Advance of one monospace character in em. */
export const CHAR_EM = 0.6;
const LINE_EM = 1.6;

interface ThemeColors {
  readonly background: string;
  readonly bar: string;
  readonly title: string;
  readonly gutter: string;
  readonly highlight: string;
  readonly border: string;
  readonly tokens: Readonly<Record<TokenKind, string>>;
}

export const CODE_THEME_COLORS: Readonly<Record<CodeTheme, ThemeColors>> = {
  midnight: {
    background: "#0f172a",
    bar: "#0b1222",
    title: "#94a3b8",
    gutter: "#475569",
    highlight: "#1e293b",
    border: "#1e293b",
    tokens: {
      plain: "#e2e8f0",
      comment: "#64748b",
      string: "#86efac",
      number: "#fdba74",
      keyword: "#c4b5fd",
      function: "#7dd3fc",
      type: "#fcd34d",
      tag: "#f9a8d4",
      attribute: "#fde68a",
      punctuation: "#94a3b8",
    },
  },
  paper: {
    background: "#ffffff",
    bar: "#f4f4f5",
    title: "#71717a",
    gutter: "#a1a1aa",
    highlight: "#fef9c3",
    border: "#e4e4e7",
    tokens: {
      plain: "#18181b",
      comment: "#9ca3af",
      string: "#15803d",
      number: "#c2410c",
      keyword: "#7c3aed",
      function: "#0369a1",
      type: "#b45309",
      tag: "#be185d",
      attribute: "#a16207",
      punctuation: "#6b7280",
    },
  },
  dusk: {
    background: "#1c1917",
    bar: "#171412",
    title: "#a8a29e",
    gutter: "#57534e",
    highlight: "#292524",
    border: "#292524",
    tokens: {
      plain: "#f5f5f4",
      comment: "#78716c",
      string: "#bef264",
      number: "#f9a8d4",
      keyword: "#fb923c",
      function: "#fcd34d",
      type: "#5eead4",
      tag: "#fb7185",
      attribute: "#fdba74",
      punctuation: "#a8a29e",
    },
  },
  ocean: {
    background: "#082f49",
    bar: "#06253a",
    title: "#7dd3fc",
    gutter: "#2c6b8f",
    highlight: "#0c4a6e",
    border: "#0c4a6e",
    tokens: {
      plain: "#e0f2fe",
      comment: "#5b8db0",
      string: "#a7f3d0",
      number: "#fda4af",
      keyword: "#67e8f9",
      function: "#fde047",
      type: "#c4b5fd",
      tag: "#f0abfc",
      attribute: "#fcd34d",
      punctuation: "#7dd3fc",
    },
  },
  forest: {
    background: "#052e16",
    bar: "#04240f",
    title: "#86efac",
    gutter: "#2f6b45",
    highlight: "#14532d",
    border: "#14532d",
    tokens: {
      plain: "#ecfdf5",
      comment: "#5f9a74",
      string: "#fde68a",
      number: "#fca5a5",
      keyword: "#6ee7b7",
      function: "#a5f3fc",
      type: "#fdba74",
      tag: "#f9a8d4",
      attribute: "#d9f99d",
      punctuation: "#86efac",
    },
  },
  mono: {
    background: "#18181b",
    bar: "#131316",
    title: "#a1a1aa",
    gutter: "#52525b",
    highlight: "#27272a",
    border: "#27272a",
    tokens: {
      plain: "#fafafa",
      comment: "#71717a",
      string: "#d4d4d8",
      number: "#e4e4e7",
      keyword: "#ffffff",
      function: "#e4e4e7",
      type: "#d4d4d8",
      tag: "#ffffff",
      attribute: "#d4d4d8",
      punctuation: "#a1a1aa",
    },
  },
};

const f = (v: number) => formatNumber(v, 2);

/** Parses "1, 3-5" into a set of 1-based line numbers (at most `max`). */
export function parseLineRanges(text: string, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of text.split(/[,\s]+/)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    for (let n = Math.max(1, Math.min(a, b)); n <= Math.min(max, Math.max(a, b)); n++) out.add(n);
  }
  return out;
}

/**
 * Code as display lines: tabs expanded, trailing blank lines dropped, at
 * most `CODE_MAX_LINES` lines plus an ellipsis line when cut.
 */
export function codeLines(code: string): { lines: string[]; cut: boolean } {
  let lines = code.replace(/\r\n?/g, "\n").replace(/\t/g, TAB).split("\n");
  while (lines.length > 1 && (lines[lines.length - 1] as string).trim() === "") lines.pop();
  const cut = lines.length > CODE_MAX_LINES;
  if (cut) lines = [...lines.slice(0, CODE_MAX_LINES), "…"];
  return { lines, cut };
}

export interface CodeScreenshotOptions {
  readonly width: number;
  readonly height: number;
  /** Full SVG document of the backdrop (canvas size), or "" for none. */
  readonly backdrop: string;
  readonly code: string;
  readonly language: CodeLanguage;
  readonly theme: CodeTheme;
  readonly frame: CodeFrame;
  /** File name in the title bar; escaped. */
  readonly title: string;
  readonly lineNumbers: boolean;
  /** Lines to highlight, e.g. "2, 4-6". */
  readonly highlight: string;
  /** Font size in px before any scaling. */
  readonly fontSize: number;
  /** Margin around the window, percent of the shorter canvas edge. */
  readonly padding: number;
  /** Corner radius of the window in px before scaling. */
  readonly radius: number;
  /** Shadow strength 0 to 100. */
  readonly shadow: number;
}

export interface CodeLayout {
  /** Window size in px before scaling. */
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  /** Scale applied to fit the canvas (at most 1). */
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

function windowMetrics(o: CodeScreenshotOptions, lines: readonly string[]) {
  const fs = o.fontSize;
  const charW = fs * CHAR_EM;
  const lineH = fs * LINE_EM;
  const bar = o.frame === "window" ? fs * 2.6 : 0;
  const padX = fs * 1.6;
  const padY = fs * (o.frame === "window" ? 1 : 1.4);
  const digits = String(lines.length).length;
  const gutter = o.lineNumbers ? (digits + 2) * charW : 0;
  const longest = Math.min(
    CODE_MAX_COLUMNS,
    Math.max(24, ...lines.map((l) => Array.from(l).length)),
  );
  return {
    charW,
    lineH,
    bar,
    padX,
    padY,
    gutter,
    width: 2 * padX + gutter + longest * charW,
    height: bar + 2 * padY + lines.length * lineH,
  };
}

/** Where the window sits on the canvas. */
export function codeLayout(o: CodeScreenshotOptions): CodeLayout {
  const { lines } = codeLines(o.code);
  const m = windowMetrics(o, lines);
  const margin = (Math.min(o.width, o.height) * o.padding) / 100;
  const scale = Math.min(
    1,
    Math.max(1e-3, (o.width - 2 * margin) / m.width),
    Math.max(1e-3, (o.height - 2 * margin) / m.height),
  );
  return {
    naturalWidth: m.width,
    naturalHeight: m.height,
    scale,
    x: (o.width - m.width * scale) / 2,
    y: (o.height - m.height * scale) / 2,
  };
}

function cutLine(text: string): string {
  const chars = Array.from(text);
  return chars.length > CODE_MAX_COLUMNS
    ? `${chars.slice(0, CODE_MAX_COLUMNS - 1).join("")}…`
    : text;
}

export function codeScreenshotSvg(o: CodeScreenshotOptions): string {
  const { width: W, height: H } = o;
  const colors = CODE_THEME_COLORS[o.theme];
  const { lines: shown } = codeLines(o.code);
  const m = windowMetrics(o, shown);
  const layout = codeLayout(o);
  const marked = parseLineRanges(o.highlight, shown.length);

  const parts: string[] = [];
  if (o.backdrop) parts.push(o.backdrop.replace("<svg ", '<svg x="0" y="0" '));

  const win = { x: 0, y: 0, width: m.width, height: m.height };
  const winPath = roundedRectPath(win, o.radius);
  let defs = "";

  // Shadow: one soft blur under the window, light from the top.
  const s = Math.min(Math.max(o.shadow, 0), 100) / 100;
  let shadow = "";
  if (s > 0) {
    const sigma = s * 0.05 * Math.min(m.width, m.height);
    const pad = 3 * sigma;
    const def =
      `<filter x="${f(-pad)}" y="${f(-pad)}" width="${f(m.width + 2 * pad)}" height="${f(m.height + 3 * pad)}" ` +
      `filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="${f(sigma)}"/></filter>`;
    const id = stableId("cs", def);
    defs += def.replace("<filter ", `<filter id="${id}" `);
    shadow = `<path d="${winPath}" transform="translate(0 ${f(sigma * 0.8)})" fill="#000" fill-opacity="${formatNumber(0.15 + 0.4 * s, 3)}" filter="url(#${id})"/>`;
  }

  const clip = stableId("cc", winPath);
  defs += `<clipPath id="${clip}"><path d="${winPath}"/></clipPath>`;

  const inner: string[] = [shadow, `<path d="${winPath}" fill="${colors.background}"/>`];
  const body: string[] = [];
  if (o.frame === "window") {
    body.push(`<rect width="${f(m.width)}" height="${f(m.bar)}" fill="${colors.bar}"/>`);
    const r = m.bar * 0.12;
    WINDOW_BUTTON_COLORS.forEach((c, i) => {
      body.push(
        `<circle cx="${f(m.padX * 0.75 + r + i * r * 3.2)}" cy="${f(m.bar / 2)}" r="${f(r)}" fill="${c}"/>`,
      );
    });
    const title = o.title.trim();
    if (title) {
      const size = o.fontSize * 0.85;
      const room = m.width - 2 * (m.padX * 0.75 + r * 9);
      const max = Math.max(0, Math.floor(room / (size * CHAR_EM)));
      const chars = Array.from(title);
      const text = chars.length > max ? `${chars.slice(0, Math.max(0, max - 1)).join("")}…` : title;
      if (max > 1) {
        body.push(
          `<text x="${f(m.width / 2)}" y="${f(m.bar / 2 + size * 0.35)}" font-family="${CODE_FONT_STACK}" font-size="${f(size)}" fill="${colors.title}" text-anchor="middle">${escapeXml(text)}</text>`,
        );
      }
    }
  }

  const top = m.bar + m.padY;
  for (const n of marked) {
    body.push(
      `<rect y="${f(top + (n - 1) * m.lineH)}" width="${f(m.width)}" height="${f(m.lineH)}" fill="${colors.highlight}"/>`,
    );
  }

  const code = tokenLines(tokenize(shown.map(cutLine).join("\n"), o.language));
  const textX = m.padX + m.gutter;
  const baseline = (i: number) => top + i * m.lineH + m.lineH / 2 + o.fontSize * 0.35;
  const textParts: string[] = [];
  shown.forEach((_, i) => {
    const y = f(baseline(i));
    if (o.lineNumbers) {
      textParts.push(
        `<text x="${f(m.padX + m.gutter - 2 * m.charW)}" y="${y}" fill="${colors.gutter}" text-anchor="end">${i + 1}</text>`,
      );
    }
    const tokens = code[i] ?? [];
    if (tokens.length === 0) return;
    const spans = tokens
      .map((t) => `<tspan fill="${colors.tokens[t.kind]}">${escapeXml(t.text)}</tspan>`)
      .join("");
    textParts.push(`<text x="${f(textX)}" y="${y}" xml:space="preserve">${spans}</text>`);
  });
  body.push(
    `<g font-family="${CODE_FONT_STACK}" font-size="${f(o.fontSize)}">${textParts.join("")}</g>`,
  );
  inner.push(`<g clip-path="url(#${clip})">${body.join("")}</g>`);
  inner.push(`<path d="${winPath}" fill="none" stroke="${colors.border}" stroke-width="1"/>`);

  parts.push(
    `<g transform="translate(${f(layout.x)} ${f(layout.y)}) scale(${formatNumber(layout.scale, 5)})">${inner.join("")}</g>`,
  );
  return svgDocument(W, H, `<defs>${defs}</defs>${parts.join("")}`);
}
