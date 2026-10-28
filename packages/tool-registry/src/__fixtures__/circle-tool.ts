/**
 * Minimal test-only tool (one circle) that exercises the full contract.
 * Not exported from the package.
 */
import * as z from "zod";
import { colorSchema, visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";

const schema = visualParamsSchema.extend({
  radius: z.number().min(0.05).max(0.5),
  stroke: z.boolean(),
  strokeColor: colorSchema,
  jitter: z.number().min(0).max(0.25),
});

type CircleParams = z.output<typeof schema>;

const defaults: CircleParams = {
  background: "#ffffff",
  palette: ["#1e90ff", "#ff6347"],
  radius: 0.3,
  stroke: false,
  strokeColor: "#000000",
  jitter: 0,
};

const preset = (id: string, params: Partial<CircleParams>): Preset<CircleParams> => ({
  id,
  nameKey: `tools.test-circle.presets.${id}`,
  params: { ...defaults, ...params },
});

const fmt = (n: number): string => String(Math.round(n * 100) / 100);

export const circleTool = defineTool({
  id: "test-circle",
  version: 1,
  category: ["backgrounds", "patterns"],
  schema,
  defaults,
  presets: [
    preset("classic", {}),
    preset("tiny", { radius: 0.08 }),
    preset("huge", { radius: 0.5 }),
    preset("outline", { stroke: true }),
    preset("transparent", { background: "transparent" }),
    preset("wobbly", { jitter: 0.2, palette: ["#222", "#eee", "#f0a"] }),
  ],
  controls: {
    groups: [{ id: "shape", labelKey: "tools.test-circle.groups.shape" }],
    params: {
      radius: { group: "shape", step: 0.01 },
      strokeColor: { visibleWhen: (p) => p.stroke },
    },
  },
  randomize(rng, current, locks) {
    const next: CircleParams = {
      background: current.background,
      strokeColor: current.strokeColor,
      palette: rng.shuffle(current.palette),
      radius: Math.round(rng.float(0.05, 0.5) * 100) / 100,
      stroke: rng.bool(),
      jitter: Math.round(rng.float(0, 0.25) * 100) / 100,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height }) {
      const r = Math.min(width, height) * p.radius;
      const cx = width / 2 + rng.float(-p.jitter, p.jitter) * width;
      const cy = height / 2 + rng.float(-p.jitter, p.jitter) * height;
      const bg =
        p.background === "transparent"
          ? ""
          : `<rect width="${width}" height="${height}" fill="${p.background}"/>`;
      const stroke = p.stroke ? ` stroke="${p.strokeColor}" stroke-width="4"` : "";
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
        `${bg}<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="${p.palette[0] ?? "#000"}"${stroke}/></svg>`
      );
    },
  },
  exports: ["svg", "png"],
});
