/**
 * Generic vitest suites every tool must pass. Import from
 * `@musterli/tool-registry/testing` in test files only; this module imports
 * vitest and must never end up in the app bundle.
 */
import { createRng } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { DEFAULT_CANVAS_SIZE } from "./common";
import { itemLockKey, parseItemLockKey } from "./randomize";
import { TOOL_ID_PATTERN } from "./registry";
import { createRenderContext } from "./render";
import type {
  AnyToolDefinition,
  CanvasSize,
  CssOutput,
  ParamsSchema,
  ToolDefinition,
} from "./types";

export const MIN_PRESETS = 6;

export interface ContractOptions {
  /** Seed for render checks. Default 1. */
  seed?: number;
  /** Render size. Default: `tool.defaultSize` or `DEFAULT_CANVAS_SIZE`. */
  size?: CanvasSize;
  /** Number of seeds fed to `randomize` when checking schema validity. Default 25. */
  randomizeRuns?: number;
}

/** What a static renderer returns, for comparisons and snapshots. */
export type StaticRenderOutput = string | CssOutput;

/**
 * Renders svg, css and text tools once with a fresh context. Returns
 * `undefined` for kinds that need a browser (canvas2d, webgl, image-effect).
 */
export function renderStatic(
  tool: AnyToolDefinition,
  params: unknown,
  seed: number,
  size: CanvasSize,
): StaticRenderOutput | undefined {
  // The tool is type-erased here; params are validated by the caller's schema.
  const p = tool.schema.parse(params);
  const ctx = createRenderContext(seed, size);
  switch (tool.render.kind) {
    case "svg":
    case "text":
    case "css":
      return tool.render.render(p, ctx);
    default:
      return undefined;
  }
}

const NAME_START = /[A-Za-z_:]/;

/**
 * Light well-formedness check for generated SVG (no DOM in Node): single root
 * `<svg>` with xmlns and a size, balanced tags, quoted attributes, unique ids and no
 * leaked `NaN`/`undefined`/`Infinity`. Returns a list of problems, empty if fine.
 */
export function checkSvg(svg: string): string[] {
  const problems: string[] = [];
  const src = svg.trim();
  if (!src.startsWith("<svg")) problems.push("does not start with <svg");
  if (!src.endsWith("</svg>")) problems.push("does not end with </svg>");

  const rootMatch = /^<svg\b([^>]*)>/.exec(src);
  const rootAttrs = rootMatch?.[1] ?? "";
  if (!/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(rootAttrs)) {
    problems.push("root <svg> lacks xmlns");
  }
  const hasViewBox = /\sviewBox="[^"]+"/.test(rootAttrs);
  const hasSize = /\swidth="[^"]+"/.test(rootAttrs) && /\sheight="[^"]+"/.test(rootAttrs);
  if (!hasViewBox && !hasSize) problems.push("root <svg> has neither viewBox nor width/height");

  // Base64 payloads (embedded raster tiles) may contain these words by chance.
  const text = src.replace(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=]*/g, "data:");
  for (const bad of ["NaN", "undefined", "Infinity", "null"]) {
    if (new RegExp(`\\b${bad}\\b`).test(text)) problems.push(`contains "${bad}"`);
  }

  const ids = new Set<string>();
  for (const m of src.matchAll(/\sid="([^"]*)"/g)) {
    const id = m[1] ?? "";
    if (ids.has(id)) problems.push(`duplicate id "${id}"`);
    ids.add(id);
  }

  const stack: string[] = [];
  let roots = 0;
  const tag =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([^\s/>]+)((?:\s+[^\s=/>]+="[^"]*")*)\s*(\/?)>/g;
  let last = 0;
  for (let m = tag.exec(src); m !== null; m = tag.exec(src)) {
    if (src.slice(last, m.index).includes("<")) {
      problems.push(`malformed markup near offset ${last}`);
      break;
    }
    last = tag.lastIndex;
    const [, closing, name, , selfClosing] = m;
    if (name === undefined) continue; // comment or CDATA
    if (!NAME_START.test(name)) problems.push(`invalid tag name "${name}"`);
    if (closing) {
      const open = stack.pop();
      if (open !== name) {
        problems.push(`unexpected </${name}>, expected </${open ?? "nothing"}>`);
        break;
      }
    } else if (!selfClosing) {
      if (stack.length === 0) roots++;
      stack.push(name);
    } else if (stack.length === 0) {
      roots++;
    }
  }
  if (src.slice(last).includes("<")) problems.push(`malformed markup near offset ${last}`);
  if (stack.length > 0) problems.push(`unclosed <${stack.join("> <")}>`);
  if (roots !== 1) problems.push(`expected exactly one root element, found ${roots}`);
  return problems;
}

function schemaKeys(tool: AnyToolDefinition): Set<string> {
  return new Set(Object.keys(tool.schema.shape));
}

/** List params (arrays of objects) and their item schemas. */
function listParams(tool: AnyToolDefinition): { key: string; item: z.ZodObject }[] {
  return Object.entries(tool.schema.shape).flatMap(([key, schema]) =>
    schema instanceof z.ZodArray && schema.element instanceof z.ZodObject
      ? [{ key, item: schema.element }]
      : [],
  );
}

/** Lock keys of every field of the first two items of every list param. */
function itemLockKeys(tool: AnyToolDefinition): string[] {
  return listParams(tool).flatMap(({ key, item }) =>
    [0, 1].flatMap((index) =>
      Object.keys(item.shape).map((field) => itemLockKey(key, index, field)),
    ),
  );
}

/**
 * Registers the generic contract suite for a tool:
 * metadata, defaults and presets vs. schema, randomize (schema, locks,
 * determinism, purity) and deterministic, well-formed static output.
 */
export function describeToolContract<S extends ParamsSchema>(
  tool: ToolDefinition<S>,
  options: ContractOptions = {},
): void {
  // Erase the schema type once; all checks below are type-agnostic.
  const anyTool: AnyToolDefinition = tool;
  const seed = options.seed ?? 1;
  const size = options.size ?? tool.defaultSize ?? DEFAULT_CANVAS_SIZE;
  const runs = options.randomizeRuns ?? 25;
  const keys = [...schemaKeys(anyTool)];

  describe(`tool contract: ${tool.id}`, () => {
    describe("metadata", () => {
      it("has a kebab-case id and a positive integer version", () => {
        expect(tool.id).toMatch(TOOL_ID_PATTERN);
        expect(Number.isInteger(tool.version) && tool.version >= 1).toBe(true);
      });

      it("declares unique exports and categories", () => {
        expect(tool.exports.length).toBeGreaterThan(0);
        expect(new Set(tool.exports).size).toBe(tool.exports.length);
        expect(new Set(tool.category).size).toBe(tool.category.length);
      });

      it("only references existing params in controls", () => {
        const known = schemaKeys(anyTool);
        const referenced = [
          ...Object.keys(tool.controls?.params ?? {}),
          ...(tool.controls?.order ?? []),
          ...(anyTool.regenerateOn ?? []),
        ];
        expect(referenced.filter((k) => !known.has(k))).toEqual([]);
        const groups = new Set((tool.controls?.groups ?? []).map((g) => g.id));
        const hints = Object.values(anyTool.controls?.params ?? {});
        const unknownGroups = hints.flatMap((h) =>
          h?.group !== undefined && !groups.has(h.group) ? [h.group] : [],
        );
        expect(unknownGroups).toEqual([]);
      });

      it.runIf(listParams(anyTool).length > 0)("only references existing item fields", () => {
        for (const { key, item } of listParams(anyTool)) {
          const fields = new Set(Object.keys(item.shape));
          const list = anyTool.controls?.params?.[key]?.list;
          const referenced = [
            ...Object.keys(list?.item?.params ?? {}),
            ...(list?.item?.order ?? []),
            ...(list?.visibilityField !== undefined ? [list.visibilityField] : []),
            ...(list?.titleField !== undefined ? [list.titleField] : []),
          ];
          expect(referenced.filter((k) => !fields.has(k))).toEqual([]);
          const items = (tool.defaults as Record<string, Record<string, unknown>[]>)[key] ?? [];
          const added = list?.newItem?.(items) ?? items[0];
          expect(item.safeParse(added).success).toBe(true);
        }
      });
    });

    describe("defaults and presets", () => {
      it("defaults pass schema.parse unchanged", () => {
        expect(tool.schema.parse(tool.defaults)).toEqual(tool.defaults);
      });

      it("defaults and presets survive a JSON round trip (jsonb, share links)", () => {
        for (const params of [tool.defaults, ...tool.presets.map((p) => p.params)]) {
          expect(JSON.parse(JSON.stringify(params))).toEqual(params);
        }
      });

      it(`has at least ${MIN_PRESETS} presets with unique ids and name keys`, () => {
        expect(tool.presets.length).toBeGreaterThanOrEqual(MIN_PRESETS);
        const ids = tool.presets.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const p of tool.presets) {
          expect(p.id).toMatch(TOOL_ID_PATTERN);
          expect(p.nameKey.length).toBeGreaterThan(0);
        }
      });

      it.each(tool.presets.map((p) => [p.id, p] as const))(
        "preset %s passes schema.parse unchanged",
        (_, p) => {
          expect(tool.schema.parse(p.params)).toEqual(p.params);
        },
      );
    });

    describe("randomize", () => {
      const starts = [tool.defaults, ...tool.presets.slice(0, 2).map((p) => p.params)];

      it("returns params that pass the schema", () => {
        for (let s = 0; s < runs; s++) {
          const start = starts[s % starts.length] ?? tool.defaults;
          const out = tool.randomize(createRng(s), start, new Set());
          const result = tool.schema.safeParse(out);
          expect(result.success, `seed ${s}: ${result.error?.message ?? ""}`).toBe(true);
        }
      });

      it("is deterministic for the same seed", () => {
        const a = tool.randomize(createRng(42), tool.defaults, new Set());
        const b = tool.randomize(createRng(42), tool.defaults, new Set());
        expect(a).toEqual(b);
      });

      it("does not mutate the current params", () => {
        const current = JSON.parse(JSON.stringify(tool.defaults)) as typeof tool.defaults;
        tool.randomize(createRng(7), current, new Set());
        expect(current).toEqual(tool.defaults);
      });

      it.each(keys)("keeps locked param %s unchanged", (key) => {
        const locks = new Set([key]);
        for (const start of starts) {
          for (let s = 0; s < 5; s++) {
            const out = anyTool.randomize(createRng(s), start, locks);
            expect(out[key]).toEqual(start[key]);
          }
        }
      });

      it.each(itemLockKeys(anyTool))("keeps locked list item field %s unchanged", (key) => {
        const path = parseItemLockKey(key);
        if (!path) throw new Error(`not an item lock: ${key}`);
        for (const start of starts) {
          const before = (start[path.list] as Record<string, unknown>[])[path.index];
          if (!before) continue;
          for (let s = 0; s < 5; s++) {
            const out = anyTool.randomize(createRng(s), start, new Set([key]));
            const after = (out[path.list] as Record<string, unknown>[])[path.index];
            expect(after?.[path.field]).toEqual(before[path.field]);
          }
        }
      });

      it("returns the current params when everything is locked", () => {
        const out = anyTool.randomize(createRng(3), tool.defaults, new Set(keys));
        expect(out).toEqual(tool.defaults);
      });
    });

    describe("render", () => {
      const output = (): StaticRenderOutput | undefined =>
        renderStatic(anyTool, tool.defaults, seed, size);
      const isStatic = output() !== undefined;

      it.runIf(isStatic)(`is deterministic for defaults and seed ${seed}`, () => {
        expect(output()).toEqual(output());
      });

      it.runIf(tool.render.kind === "svg")("produces well-formed SVG", () => {
        expect(checkSvg(output() as string)).toEqual([]);
      });

      it.runIf(tool.render.kind === "css")("produces CSS and a well-formed preview SVG", () => {
        const out = output() as CssOutput;
        expect(out.css.trim().length).toBeGreaterThan(0);
        expect(out.css).not.toMatch(/\b(?:NaN|undefined|Infinity)\b/);
        if (out.previewSvg !== undefined) expect(checkSvg(out.previewSvg)).toEqual([]);
      });

      it.runIf(isStatic)("renders every preset as well-formed output", () => {
        for (const p of tool.presets) {
          const out = renderStatic(anyTool, p.params, p.seed ?? seed, size);
          const svg = typeof out === "string" ? out : out?.previewSvg;
          if (tool.render.kind !== "text" && svg !== undefined) {
            expect(checkSvg(svg), `preset ${p.id}`).toEqual([]);
          }
        }
      });
    });

    describe("extra exports", () => {
      const extras = anyTool.extraExports ?? [];

      it("have unique kebab-case ids and label keys", () => {
        const ids = extras.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const e of extras) {
          expect(e.id).toMatch(TOOL_ID_PATTERN);
          expect(e.labelKey.length).toBeGreaterThan(0);
        }
      });

      it.each(extras.map((e) => [e.id, e] as const))(
        "%s renders deterministic, non-empty text for defaults and presets",
        (_, extra) => {
          for (const p of [
            { params: tool.defaults, seed },
            ...tool.presets.map((pr) => ({ params: pr.params, seed: pr.seed ?? seed })),
          ]) {
            const run = (): string =>
              extra.render(anyTool.schema.parse(p.params), createRenderContext(p.seed, size));
            const out = run();
            expect(out.trim().length).toBeGreaterThan(0);
            expect(out).not.toMatch(/\b(?:NaN|undefined|Infinity|null)\b/);
            expect(run()).toBe(out);
          }
        },
      );
    });
  });
}

export interface SnapshotOptions extends Pick<ContractOptions, "seed" | "size"> {
  /**
   * Shortens the output before snapshotting, e.g. replaces an embedded
   * raster data URI by its checksum. Must stay deterministic and must not
   * hide changes (keep a digest of what it removes).
   */
  normalize?(output: StaticRenderOutput): StaticRenderOutput;
}

/**
 * Snapshots the static output of every preset, rendered with `seed`
 * (default 1, as required by CLAUDE.md) unless the preset pins its own seed.
 */
export function describePresetSnapshots<S extends ParamsSchema>(
  tool: ToolDefinition<S>,
  options: SnapshotOptions = {},
): void {
  const anyTool: AnyToolDefinition = tool;
  const seed = options.seed ?? 1;
  const size = options.size ?? tool.defaultSize ?? DEFAULT_CANVAS_SIZE;
  const normalize = options.normalize ?? ((out: StaticRenderOutput) => out);

  describe(`preset snapshots: ${tool.id}`, () => {
    it.each(tool.presets.map((p) => [p.id, p] as const))("%s", (_, p) => {
      const out = renderStatic(anyTool, p.params, p.seed ?? seed, size);
      expect(out, `${tool.render.kind} tools cannot be snapshotted statically`).toBeDefined();
      expect(out === undefined ? out : normalize(out)).toMatchSnapshot();
    });

    const extras = anyTool.extraExports ?? [];
    it.runIf(extras.length > 0)("extra exports of every preset", () => {
      const out = Object.fromEntries(
        tool.presets.map((p) => [
          p.id,
          Object.fromEntries(
            extras.map((e) => [
              e.id,
              normalize(
                e.render(anyTool.schema.parse(p.params), createRenderContext(p.seed ?? seed, size)),
              ),
            ]),
          ),
        ]),
      );
      expect(out).toMatchSnapshot();
    });
  });
}
