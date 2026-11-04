/**
 * Embed snippets (docs/ARCHITECTURE.md 4.22): the same player and config
 * wrapped for a plain HTML page, a Web Component and React, plus the raw
 * GLSL for developers with their own WebGL setup. Pure text, nothing is
 * loaded from musterli.app.
 */
import type { EmbedConfig } from "./config";
import { EMBED_PLAYER_JS } from "./player";

export interface EmbedSnippetOptions {
  /** Tool name for the header comment (already localised or the tool id). */
  title: string;
  /** Height of the example box in CSS px. */
  height?: number;
}

const DEFAULT_HEIGHT = 480;

/** `</script>` and `<!--` must not end or open anything inside a script. */
function scriptSafe(json: string): string {
  return json.replace(/</g, "\\u003c");
}

function configJson(config: EmbedConfig): string {
  return scriptSafe(JSON.stringify(config));
}

function safeTitle(title: string): string {
  return title
    .replace(/[<>]/g, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\*\//g, "* /")
    .replace(/--/g, "- -");
}

function headerLines(title: string, lines: readonly string[]): string[] {
  return [
    `${safeTitle(title)}: live shader background made with Musterli (musterli.app).`,
    ...lines,
  ];
}

function header(prefix: string, title: string, lines: readonly string[]): string {
  return headerLines(title, lines)
    .map((l) => `${prefix} ${l}`)
    .join("\n");
}

const FREE_NOTE = "Free to use in any project, no attribution needed. Runs fully in the browser.";

/** A plain HTML block: a box with your content plus an inline script. */
export function embedHtml(config: EmbedConfig, opts: EmbedSnippetOptions): string {
  const height = opts.height ?? DEFAULT_HEIGHT;
  return [
    "<!--",
    ...headerLines(opts.title, [
      FREE_NOTE,
      "Paste where the background should appear. The box takes the size you give it.",
      "Optional: set fps (1 to 60) and maxDpr (sharpness, default 1.5) below.",
    ]).map((l) => `  ${l}`),
    "-->",
    `<div class="musterli-shader" style="position: relative; min-height: ${height}px; background: ${config.b};">`,
    "  <!-- Your content -->",
    "</div>",
    "<script>",
    "(function () {",
    `  var play = ${EMBED_PLAYER_JS.replace(/\n/g, "\n  ")};`,
    `  var config = ${configJson(config)};`,
    "  play(document.currentScript.previousElementSibling, config, { fps: 30, maxDpr: 1.5 });",
    "})();",
    "</script>",
    "",
  ].join("\n");
}

/** A Web Component file: `<musterli-shader>` with attributes fps, max-dpr, still. */
export function embedWebComponent(config: EmbedConfig, opts: EmbedSnippetOptions): string {
  const height = opts.height ?? DEFAULT_HEIGHT;
  return [
    header("//", opts.title, [
      FREE_NOTE,
      'Usage: load this file with a deferred script tag (src="musterli-shader.js"), then write',
      `  <musterli-shader style="height: ${height}px">Your content</musterli-shader>`,
      "Attributes: fps (1 to 60), max-dpr (sharpness, default 1.5), still (no motion).",
      "Two different backgrounds on one page: change TAG in the second file.",
    ]),
    "(function () {",
    '  var TAG = "musterli-shader";',
    `  var play = ${EMBED_PLAYER_JS.replace(/\n/g, "\n  ")};`,
    `  var config = ${configJson(config)};`,
    "  if (!window.customElements || customElements.get(TAG)) return;",
    "  customElements.define(TAG, class extends HTMLElement {",
    "    connectedCallback() {",
    '      if (!this.style.display) this.style.display = "block";',
    "      this._player = play(this, config, {",
    '        fps: Number(this.getAttribute("fps")) || 30,',
    '        maxDpr: Number(this.getAttribute("max-dpr")) || 1.5,',
    '        still: this.hasAttribute("still"),',
    "      });",
    "    }",
    "    disconnectedCallback() {",
    "      if (this._player) this._player.destroy();",
    "      this._player = 0;",
    "    }",
    "  });",
    "})();",
    "",
  ].join("\n");
}

/** A React component without JSX, so it works as `.js`, `.jsx` or `.tsx`. */
export function embedReact(config: EmbedConfig, opts: EmbedSnippetOptions): string {
  return [
    '"use client";',
    header("//", opts.title, [
      FREE_NOTE,
      "Usage: <ShaderBackground style={{ height: 480 }}>Your content</ShaderBackground>",
      "Props: fps (1 to 60), maxDpr (sharpness, default 1.5), still, className, style, children.",
    ]),
    'import { createElement, useEffect, useRef } from "react";',
    "",
    `const config = ${configJson(config)};`,
    "",
    `const play = ${EMBED_PLAYER_JS};`,
    "",
    "export default function ShaderBackground({ fps = 30, maxDpr = 1.5, still = false, className, style, children }) {",
    "  const ref = useRef();",
    "  useEffect(() => {",
    "    const player = play(ref.current, config, { fps, maxDpr, still });",
    "    return () => player.destroy();",
    "  }, [fps, maxDpr, still]);",
    `  return createElement("div", { ref, className, style: { position: "relative", ...style } }, children);`,
    "}",
    "",
  ].join("\n");
}

function glslValue(value: number | readonly number[]): string {
  return Array.isArray(value) ? `[${value.join(", ")}]` : String(value);
}

/**
 * The fragment shader with a header listing the uniforms of this design
 * (moving ones at t = 0) and what the runtime must set.
 */
export function embedGlsl(config: EmbedConfig, opts: EmbedSnippetOptions): string {
  const lines = [
    FREE_NOTE,
    "GLSL ES 3.00 (WebGL2). Draw one full-screen triangle; set per frame:",
    "  u_resolution = canvas size in px, u_tileOrigin = (0, 0), u_tileSize = u_resolution,",
    "  u_design = size in CSS px, u_palette = 256 x 1 RGBA8 colour ramp (NEAREST).",
    "Uniforms of this design:",
    ...Object.entries(config.u).map(([k, v]) => `  ${k} = ${glslValue(v)}`),
  ];
  if (config.n > 0) {
    lines.push(
      `Moving uniforms (${config.n} samples per ${config.l} s loop, values at t = 0):`,
      ...Object.entries(config.d).map(([k, all]) => {
        const len = all.length / config.n;
        return `  ${k} = ${glslValue(all.slice(0, len))}`;
      }),
    );
  }
  if (config.p) lines.push("Palette (base64 RGBA, 256 texels):", `  ${config.p}`);
  const comment = header("//", opts.title, lines);
  // `#version` must stay the first line of the shader source.
  const [version, ...rest] = config.f.split("\n");
  return [version, comment, ...rest, ""].join("\n");
}
