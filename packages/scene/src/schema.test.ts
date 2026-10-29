import { describe, expect, it } from "vitest";
import { createScene, createShapeLayer, createTextLayer } from "./factory";
import {
  SCENE_IMAGES_MAX,
  SCENE_LAYERS_MAX,
  isColorSlot,
  normalizeHex,
  parseScene,
  resolveColor,
  sceneSchema,
  type Layer,
  type Scene,
} from "./schema";
import { EXAMPLE_SCENES, TEST_PNG } from "./test-scenes";
import { createImageLayer } from "./factory";

const valid = () => EXAMPLE_SCENES.announcement();

function withLayers(scene: Scene, layers: unknown[]): unknown {
  return { ...scene, layers };
}

describe("scene schema", () => {
  it("accepts every example scene", () => {
    for (const make of Object.values(EXAMPLE_SCENES)) {
      const result = parseScene(make());
      expect(result.success, result.success ? "" : result.error).toBe(true);
    }
  });

  it("normalises fixed colours and keeps slots", () => {
    const scene = valid();
    const text = createTextLayer("t", scene.format, "Hallo", { color: "#ABC" });
    const parsed = sceneSchema.parse({ ...scene, layers: [...scene.layers, text] });
    const last = parsed.layers.at(-1) as Extract<Layer, { kind: "text" }>;
    expect(last.color).toBe("#aabbcc");
    expect(parsed.layers.find((l) => l.id === "headline")).toMatchObject({ color: "brand-1" });
  });

  it("rejects broken scenes", () => {
    const scene = valid();
    const text = scene.layers.find((l) => l.kind === "text");
    if (!text) throw new Error("fixture");
    const cases: [string, unknown][] = [
      ["wrong version", { ...scene, version: 2 }],
      ["tiny format", { ...scene, format: { id: null, width: 8, height: 1080 } }],
      ["huge format", { ...scene, format: { id: null, width: 9000, height: 1080 } }],
      ["format id", { ...scene, format: { id: "../x", width: 100, height: 100 } }],
      ["palette too short", { ...scene, palette: ["#000000"] }],
      ["palette not hex", { ...scene, palette: ["red", "#000000"] }],
      ["duplicate ids", withLayers(scene, [...scene.layers, { ...text }])],
      ["unsafe id", withLayers(scene, [{ ...text, id: "<script>" }])],
      ["background on top", withLayers(scene, [...scene.layers.slice(1), scene.layers[0]])],
      ["unknown group", withLayers(scene, [{ ...text, groupId: "nope" }])],
      ["unknown kind", withLayers(scene, [{ ...text, kind: "video" }])],
      ["opacity", withLayers(scene, [{ ...text, opacity: 2 }])],
      ["rotation", withLayers(scene, [{ ...text, rotation: 720 }])],
      ["negative size", withLayers(scene, [{ ...text, width: -5 }])],
      ["infinite position", withLayers(scene, [{ ...text, x: Infinity }])],
      ["far away", withLayers(scene, [{ ...text, x: 1e9 }])],
      ["font too large", withLayers(scene, [{ ...text, fontSize: 5000 }])],
      ["text too long", withLayers(scene, [{ ...text, text: "x".repeat(2001) }])],
      ["bad colour", withLayers(scene, [{ ...text, color: "javascript:alert(1)" }])],
      ["slot 11", withLayers(scene, [{ ...text, color: "brand-11" }])],
      [
        "bad anchor",
        withLayers(scene, [{ ...text, constraints: { ...text.constraints, h: "left" } }]),
      ],
      [
        "background params array",
        withLayers(scene, [{ ...scene.layers[0], params: [] }, ...scene.layers.slice(1)]),
      ],
      [
        "unknown library shape",
        withLayers(scene, [{ ...createShapeLayer("s", scene.format, "library", "nope") }]),
      ],
      [
        "image with script URI",
        withLayers(scene, [
          {
            ...createImageLayer("i", scene.format, TEST_PNG),
            image: { ...TEST_PNG, href: "javascript:alert(1)" },
          },
        ]),
      ],
      [
        "svg image as raster",
        withLayers(scene, [
          {
            ...createImageLayer("i", scene.format, TEST_PNG),
            image: { ...TEST_PNG, href: "data:image/svg+xml;base64,PHN2Zz4=" },
          },
        ]),
      ],
      [
        "raster image too large",
        withLayers(scene, [
          { ...createImageLayer("i", scene.format, TEST_PNG), image: { ...TEST_PNG, width: 5000 } },
        ]),
      ],
    ];
    for (const [label, value] of cases) {
      expect(sceneSchema.safeParse(value).success, label).toBe(false);
    }
  });

  it("enforces the layer and picture limits", () => {
    const scene = createScene("square");
    const texts = Array.from({ length: SCENE_LAYERS_MAX + 1 }, (_, i) =>
      createTextLayer(`t${i}`, scene.format, "x"),
    );
    expect(sceneSchema.safeParse({ ...scene, layers: texts }).success).toBe(false);
    expect(sceneSchema.safeParse({ ...scene, layers: texts.slice(1) }).success).toBe(true);
    const pictures = Array.from({ length: SCENE_IMAGES_MAX + 1 }, (_, i) =>
      createImageLayer(`p${i}`, scene.format, TEST_PNG),
    );
    expect(sceneSchema.safeParse({ ...scene, layers: pictures }).success).toBe(false);
    expect(sceneSchema.safeParse({ ...scene, layers: pictures.slice(1) }).success).toBe(true);
  });

  it("resolves colour slots against the palette", () => {
    const palette = ["#111111", "#222222", "#333333"];
    expect(resolveColor("brand-1", palette)).toBe("#111111");
    expect(resolveColor("brand-3", palette)).toBe("#333333");
    expect(resolveColor("brand-4", palette)).toBe("#111111");
    expect(resolveColor("#ABC", palette)).toBe("#aabbcc");
    expect(isColorSlot("brand-10")).toBe(true);
    expect(isColorSlot("brand-0")).toBe(false);
    expect(normalizeHex("#12345")).toBeNull();
  });
});
