import {
  backgroundSchema,
  colorSchema,
  defineTool,
  paletteSchema,
  type AnyToolDefinition,
} from "@motivo/tool-registry";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { fixtureDefaults, fixtureTool } from "../test/fixture-tool";
import {
  SEGMENTED_MAX_OPTIONS,
  deriveControlKind,
  optionLabelKey,
  orderedParamKeys,
  paramLabelKey,
  resolveControl,
  resolveControls,
} from "./resolve";

describe("deriveControlKind", () => {
  it.each([
    ["bounded number", z.number().min(0).max(1), "slider"],
    ["bounded int", z.int().min(1).max(9), "slider"],
    ["number with one bound", z.number().min(0), "number"],
    ["unbounded number", z.number(), "number"],
    ["small enum", z.enum(["a", "b", "c", "d", "e"]), "segmented"],
    ["large enum", z.enum(["a", "b", "c", "d", "e", "f"]), "select"],
    ["literal union", z.union([z.literal("x"), z.literal("y")]), "segmented"],
    ["multi literal", z.literal([1, 2, 3]), "segmented"],
    ["boolean", z.boolean(), "switch"],
    ["string", z.string(), "text"],
    ["color", colorSchema, "color"],
    ["palette", paletteSchema, "palette"],
    ["background", backgroundSchema, "background"],
    ["optional number", z.number().min(0).max(1).optional(), "slider"],
    ["defaulted enum", z.enum(["a", "b"]).default("a"), "segmented"],
    ["optional color", colorSchema.optional(), "color"],
    ["object", z.object({ a: z.number() }), "hidden"],
  ] as const)("%s -> %s", (_name, schema, kind) => {
    expect(deriveControlKind(schema)).toBe(kind);
  });

  it("switches from segmented to select above the limit", () => {
    expect(SEGMENTED_MAX_OPTIONS).toBe(5);
  });
});

describe("resolveControl", () => {
  it("derives slider bounds, step and default label key", () => {
    expect(resolveControl(fixtureTool, "count")).toEqual({
      key: "count",
      kind: "slider",
      labelKey: "tools.test-fixture.params.count.label",
      lockable: true,
      advanced: false,
      defaultValue: 10,
      min: 1,
      max: 50,
      step: 1,
      integer: true,
    });
    const opacity = resolveControl(fixtureTool, "opacity");
    expect(opacity).toMatchObject({ kind: "slider", step: 0.01, integer: false });
  });

  it("applies hints: kind, step, unit, labels, description, lockable, advanced", () => {
    expect(
      resolveControl(fixtureTool, "rotation", { kind: "angle", unit: "°", step: 15 }),
    ).toMatchObject({ kind: "angle", min: 0, max: 360, step: 15, unit: "°" });
    expect(
      resolveControl(fixtureTool, "count", {
        labelKey: "custom.label",
        descriptionKey: "custom.help",
        lockable: false,
        advanced: true,
      }),
    ).toMatchObject({
      labelKey: "custom.label",
      descriptionKey: "custom.help",
      lockable: false,
      advanced: true,
    });
  });

  it("falls back to a number field when a slider has no finite range", () => {
    expect(resolveControl(fixtureTool, "offset", { kind: "slider" })).toMatchObject({
      kind: "number",
      step: 1,
    });
    expect(resolveControl(fixtureTool, "offset")).toMatchObject({ kind: "number" });
  });

  it("lists enum options with default and overridden label keys", () => {
    const c = resolveControl(fixtureTool, "shape", {
      optionLabelKeys: { square: "custom.square" },
    });
    expect(c).toMatchObject({
      kind: "segmented",
      options: [
        { value: "circle", labelKey: optionLabelKey("test-fixture", "shape", "circle") },
        { value: "square", labelKey: "custom.square" },
        { value: "triangle", labelKey: "tools.test-fixture.params.shape.options.triangle" },
      ],
    });
    expect(resolveControl(fixtureTool, "blend")).toMatchObject({ kind: "select" });
  });

  it("reads text and palette length limits", () => {
    expect(resolveControl(fixtureTool, "title")).toMatchObject({ kind: "text", maxLength: 40 });
    expect(resolveControl(fixtureTool, "palette")).toMatchObject({
      kind: "palette",
      minItems: 2,
      maxItems: 10,
    });
  });

  it("returns null for hidden, unknown and non-choice keys", () => {
    expect(resolveControl(fixtureTool, "internal", { kind: "hidden" })).toBeNull();
    expect(resolveControl(fixtureTool, "nope")).toBeNull();
    expect(resolveControl(fixtureTool, "count", { kind: "select" })).toBeNull();
  });

  it("builds default label keys", () => {
    expect(paramLabelKey("blob", "radius")).toBe("tools.blob.params.radius.label");
  });
});

describe("orderedParamKeys", () => {
  it("puts hinted keys first, then schema order, ignoring unknown keys", () => {
    const keys = orderedParamKeys(fixtureTool);
    expect(keys.slice(0, 4)).toEqual(["shape", "count", "background", "palette"]);
    expect(new Set(keys).size).toBe(Object.keys(fixtureTool.schema.shape).length);
  });
});

describe("resolveControls", () => {
  const keysOf = (tool: AnyToolDefinition, params = tool.defaults) =>
    resolveControls(tool, params).map((g) => ({
      id: g.id,
      collapsed: g.collapsed,
      controls: g.controls.map((c) => c.key),
      advanced: g.advanced.map((c) => c.key),
    }));

  it("groups controls in declared order, ungrouped last, hidden params omitted", () => {
    expect(keysOf(fixtureTool)).toEqual([
      { id: "shape", collapsed: false, controls: ["shape", "count", "rotation"], advanced: [] },
      { id: "style", collapsed: true, controls: ["opacity", "outline"], advanced: ["blend"] },
      {
        id: null,
        collapsed: false,
        controls: ["background", "palette", "title", "offset", "fixed"],
        advanced: [],
      },
    ]);
  });

  it("honours visibleWhen against the current params", () => {
    const groups = keysOf(fixtureTool, { ...fixtureDefaults, outline: true });
    expect(groups[1]?.controls).toEqual(["opacity", "outline", "outlineColor"]);
  });

  it("drops empty groups and works without hints", () => {
    const bare = defineTool({
      ...fixtureTool,
      id: "bare",
      controls: { groups: [{ id: "empty", labelKey: "x" }] },
    });
    const groups = keysOf(bare);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBeNull();
    expect(groups[0]?.controls).toContain("internal");
  });
});
