/**
 * Test-only tool that covers every control kind the auto-controls support.
 * Not exported from the package.
 */
import {
  colorSchema,
  createRegistry,
  defineTool,
  keepLocked,
  visualParamsSchema,
  type Preset,
} from "@motivo/tool-registry";
import * as z from "zod";

const schema = visualParamsSchema.extend({
  count: z.int().min(1).max(50),
  opacity: z.number().min(0).max(1),
  rotation: z.number().min(0).max(360),
  shape: z.enum(["circle", "square", "triangle"]),
  blend: z.enum(["normal", "multiply", "screen", "overlay", "darken", "lighten"]),
  outline: z.boolean(),
  outlineColor: colorSchema,
  title: z.string().max(40),
  offset: z.number(),
  internal: z.number(),
  fixed: z.boolean(),
});

export type FixtureParams = z.output<typeof schema>;

export const fixtureDefaults: FixtureParams = {
  background: "#ffffff",
  palette: ["#1e90ff", "#ff6347", "#ffd700"],
  count: 10,
  opacity: 0.8,
  rotation: 0,
  shape: "circle",
  blend: "normal",
  outline: false,
  outlineColor: "#000000",
  title: "Hello",
  offset: 0,
  internal: 1,
  fixed: false,
};

const preset = (
  id: string,
  params: Partial<FixtureParams>,
  seed?: number,
): Preset<FixtureParams> => {
  const p: Preset<FixtureParams> = {
    id,
    nameKey: `tools.test-fixture.presets.${id}`,
    params: { ...fixtureDefaults, ...params },
  };
  if (seed !== undefined) p.seed = seed;
  return p;
};

export const fixtureTool = defineTool({
  id: "test-fixture",
  version: 1,
  category: ["patterns"],
  schema,
  defaults: fixtureDefaults,
  presets: [
    preset("classic", {}),
    preset("dense", { count: 40 }, 99),
    preset("square", { shape: "square" }),
    preset("outlined", { outline: true }),
    preset("faint", { opacity: 0.2 }),
    preset("dark", { background: "#111111" }),
  ],
  controls: {
    groups: [
      { id: "shape", labelKey: "tools.test-fixture.groups.shape" },
      { id: "style", labelKey: "tools.test-fixture.groups.style", collapsed: true },
    ],
    order: ["shape", "count"],
    params: {
      count: { group: "shape" },
      shape: { group: "shape" },
      rotation: { group: "shape", kind: "angle", unit: "°", step: 15 },
      opacity: {
        group: "style",
        step: 0.05,
        descriptionKey: "tools.test-fixture.params.opacity.help",
      },
      blend: { group: "style", advanced: true },
      outline: { group: "style" },
      outlineColor: { group: "style", visibleWhen: (p) => p.outline },
      internal: { kind: "hidden" },
      fixed: { lockable: false },
    },
  },
  randomize(rng, current, locks) {
    const next: FixtureParams = {
      ...current,
      palette: rng.shuffle(current.palette),
      count: rng.int(1, 50),
      opacity: Math.round(rng.float(0, 1) * 100) / 100,
      rotation: rng.int(0, 360),
      shape: rng.pick(["circle", "square", "triangle"] as const),
      outline: rng.bool(),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render: (p, { width, height }) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${p.palette[0] ?? "#000"}"/></svg>`,
  },
  exports: ["svg"],
  gating: {},
});

/** Second tool for tool switching. */
export const otherTool = defineTool({
  id: "test-other",
  version: 1,
  category: ["backgrounds"],
  schema: visualParamsSchema.extend({ size: z.int().min(1).max(10) }),
  defaults: { background: "transparent", palette: ["#000000", "#ffffff"], size: 5 },
  defaultSize: { width: 1920, height: 1080 },
  presets: [],
  randomize: (rng, current, locks) =>
    keepLocked({ ...current, size: rng.int(1, 10) }, current, locks),
  render: { kind: "svg", render: () => "<svg/>" },
  exports: ["svg"],
  gating: {},
});

export function createFixtureRegistry() {
  const registry = createRegistry();
  registry.register(fixtureTool);
  registry.register(otherTool);
  return registry;
}
