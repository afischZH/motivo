import { createRng, type Rng } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import {
  createBackgroundLayer,
  createImageLayer,
  createScene,
  createShapeLayer,
  createTextLayer,
} from "./factory";
import { MAGIC_RESIZE_TEST_FORMATS, SOCIAL_FORMATS, sceneFormat } from "./formats";
import { ANCHORS, SIZE_MODES, sceneSchema, type Layer, type Scene } from "./schema";
import { checkSceneFit, fitTextLayer, resizeScene } from "./resize";
import { EXAMPLE_SCENES, TEST_PNG } from "./test-scenes";
import { createStubMeasure, fitText } from "./text";

const measure = createStubMeasure();

describe("fitText", () => {
  const style = {
    fontFamily: "x",
    fontSize: 100,
    fontWeight: 400,
    fontStyle: "normal" as const,
    lineHeight: 1.2,
    letterSpacing: 0,
  };

  it("keeps the size when the text fits", () => {
    expect(fitText("Hallo", style, 1000, 200, 20, measure)).toEqual({
      fontSize: 100,
      height: 120,
      fits: true,
    });
  });

  it("shrinks down to the minimum, then reports the height it needs", () => {
    const fit = fitText("Hallo Welt wie geht es", style, 300, 60, 40, measure);
    expect(fit.fontSize).toBeCloseTo(40, 5);
    expect(fit.fits).toBe(false);
    expect(fit.height).toBeGreaterThan(60);
  });

  it("shrinks a word wider than the box below the minimum", () => {
    const fit = fitText("Donaudampfschifffahrt", style, 300, 1000, 60, measure);
    expect(fit.fits).toBe(true);
    expect(fit.fontSize).toBeLessThan(60);
  });

  it("never needs more than the canvas", () => {
    const text = "Lorem ipsum ".repeat(60);
    const fit = fitText(text, style, 500, 100, 50, measure, 400);
    expect(fit.height).toBeLessThanOrEqual(400.5);
  });
});

describe("fitTextLayer", () => {
  it("grows the box at its anchor when the text needs more room", () => {
    const f = sceneFormat("square");
    const base = {
      ...createTextLayer("t", f, "Ein ziemlich langer Titel fuer eine kleine Box"),
      minFontSize: 80,
      fontSize: 80,
    };
    const top = fitTextLayer(
      { ...base, x: 0, y: 100, width: 400, height: 100 },
      measure,
      1080,
      "start",
    );
    expect(top.y).toBe(100);
    expect(top.height).toBeGreaterThan(100);
    const bottom = fitTextLayer(
      { ...base, x: 0, y: 100, width: 400, height: 100 },
      measure,
      1080,
      "end",
    );
    expect(bottom.y + bottom.height).toBeCloseTo(200, 5);
  });
});

describe("resizeScene", () => {
  it("covers the canvas with the background and keeps ids, order and content", () => {
    const scene = EXAMPLE_SCENES.announcement();
    const out = resizeScene(scene, sceneFormat("story"), { measure });
    expect(out.format).toEqual({ id: "story", width: 1080, height: 1920 });
    expect(out.layers.map((l) => l.id)).toEqual(scene.layers.map((l) => l.id));
    expect(out.layers[0]).toMatchObject({ x: 0, y: 0, width: 1080, height: 1920 });
    const text = out.layers.find((l) => l.id === "headline");
    expect(text).toMatchObject({ kind: "text", text: "Neue Kollektion ab heute online" });
  });

  it("keeps margins of anchored layers relative to the short side", () => {
    const scene = createScene("square");
    const f = scene.format;
    const box = (id: string, x: number, h: (typeof ANCHORS)[number]): Layer => ({
      ...createShapeLayer(id, f, "rect"),
      x,
      y: 100,
      width: 100,
      height: 100,
      constraints: { h, v: "start", size: "short", bleed: false },
    });
    const s: Scene = {
      ...scene,
      layers: [box("left", 50, "start"), box("right", 930, "end"), box("mid", 490, "center")],
    };
    const out = resizeScene(s, sceneFormat("landscape"), { measure });
    const k = 630 / 1080;
    const get = (id: string) => out.layers.find((l) => l.id === id);
    expect(get("left")?.x).toBeCloseTo(50 * k, 5);
    expect(get("left")?.width).toBeCloseTo(100 * k, 5);
    expect((get("right") as Layer).x + (get("right") as Layer).width).toBeCloseTo(1200 - 50 * k, 5);
    expect((get("mid") as Layer).x + (get("mid") as Layer).width / 2).toBeCloseTo(600, 5);
    expect(get("left")?.y).toBeCloseTo(100 * k, 5);
  });

  it("stretches along the axis and follows width or height when asked", () => {
    const scene = createScene("square");
    const layer: Layer = {
      ...createShapeLayer("bar", scene.format, "rect"),
      x: 40,
      y: 40,
      width: 1000,
      height: 50,
      constraints: { h: "stretch", v: "start", size: "height", bleed: false },
    };
    const out = resizeScene({ ...scene, layers: [layer] }, sceneFormat("story"), { measure });
    const bar = out.layers[0] as Layer;
    expect(bar.x).toBeCloseTo(40, 5);
    expect(bar.x + bar.width).toBeCloseTo(1040, 5);
    expect(bar.height).toBeCloseTo(50 * (1920 / 1080), 5);
  });

  it("returns to the same layout when resized back to the original format", () => {
    const scene = EXAMPLE_SCENES.split();
    const back = resizeScene(scene, scene.format, { measure });
    const pick = (s: Scene) => s.layers.map((l) => [l.id, Math.round(l.x), Math.round(l.y)]);
    expect(pick(back)).toEqual(pick(scene));
  });

  // M6 definition of done: every example in all six formats without cut text
  // and without layers outside the canvas (bleeding decoration excepted).
  for (const [name, make] of Object.entries(EXAMPLE_SCENES)) {
    for (const target of MAGIC_RESIZE_TEST_FORMATS) {
      it(`fits ${name} into ${target}`, () => {
        const out = resizeScene(make(), sceneFormat(target), { measure });
        expect(sceneSchema.safeParse(out).success).toBe(true);
        expect(checkSceneFit(out, measure)).toEqual([]);
        for (const layer of out.layers) {
          if (layer.kind !== "text") continue;
          // Visible: not shrunk to nothing.
          expect(layer.fontSize).toBeGreaterThanOrEqual(8);
        }
      });
    }
    it(`fits ${name} through a chain of all formats`, () => {
      let scene = make();
      for (const format of SOCIAL_FORMATS) {
        scene = resizeScene(scene, sceneFormat(format.id), { measure });
        expect(checkSceneFit(scene, measure), format.id).toEqual([]);
      }
    });
  }
});

/** A random but valid scene: layers of every kind, inside the canvas. */
function randomScene(rng: Rng): Scene {
  const format = sceneFormat(rng.pick(SOCIAL_FORMATS).id);
  const scene = createScene(format.id ?? "square");
  const layers: Layer[] = [
    createBackgroundLayer("bg", format, { id: "blob", version: 1, params: {} }, rng.int(1, 999)),
  ];
  const groups: Scene["groups"] = [];
  const count = rng.int(1, 9);
  const words = [
    "Musterli",
    "Sommer",
    "Aktion",
    "neu",
    "jetzt",
    "Farben",
    "Workshop",
    "gratis",
    "Hintergrund",
    "Zürich",
  ];
  const short = Math.min(format.width, format.height);
  for (let i = 0; i < count; i++) {
    const w = rng.float(0.1, 0.9) * format.width;
    const h = rng.float(0.05, 0.5) * format.height;
    const frame = {
      x: rng.float(0, format.width - w),
      y: rng.float(0, format.height - h),
      width: w,
      height: h,
      rotation: rng.bool(0.25) ? rng.float(-30, 30) : 0,
      constraints: {
        h: rng.pick(ANCHORS),
        v: rng.pick(ANCHORS),
        size: rng.pick(SIZE_MODES),
        bleed: false,
      },
    };
    const kind = rng.pick(["text", "text", "shape", "image"] as const);
    let layer: Layer;
    if (kind === "text") {
      const text = Array.from({ length: rng.int(1, 14) }, () => rng.pick(words)).join(" ");
      const fontSize = rng.float(0.03, 0.15) * short;
      layer = {
        ...createTextLayer(`l${i}`, format, text),
        ...frame,
        fontSize,
        minFontSize: fontSize * rng.float(0.3, 1),
      };
    } else if (kind === "shape") {
      layer = {
        ...createShapeLayer(`l${i}`, format, rng.pick(["rect", "ellipse", "line"] as const)),
        ...frame,
      };
    } else {
      layer = { ...createImageLayer(`l${i}`, format, TEST_PNG), ...frame };
    }
    layers.push(layer);
  }
  // Sometimes group two neighbours.
  const free = layers.slice(1);
  if (free.length >= 2 && rng.bool(0.5)) {
    groups.push({
      id: "g1",
      name: "",
      constraints: { h: rng.pick(ANCHORS), v: rng.pick(ANCHORS), size: "short", bleed: false },
    });
    for (const l of free.slice(0, 2)) l.groupId = "g1";
  }
  // Normalise into a valid starting point (texts fitted, everything inside).
  return resizeScene({ ...scene, format, layers, groups }, format, { measure });
}

describe("resizeScene property test", () => {
  it("keeps 300 random scenes valid and inside every format", () => {
    const rng = createRng(20261029);
    for (let run = 0; run < 300; run++) {
      const scene = randomScene(rng);
      expect(checkSceneFit(scene, measure), `start ${run}`).toEqual([]);
      const target = sceneFormat(rng.pick(SOCIAL_FORMATS).id);
      const out = resizeScene(scene, target, { measure });
      const parsed = sceneSchema.safeParse(out);
      expect(parsed.success, `schema ${run}`).toBe(true);
      expect(checkSceneFit(out, measure), `run ${run} to ${target.id}`).toEqual([]);
      expect(out.layers.length).toBe(scene.layers.length);
    }
  });
});
