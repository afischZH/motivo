import { SIZE_PRESETS } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import { inferConstraints } from "./constraints";
import { createScene, createShapeLayer, createTextLayer } from "./factory";
import { SOCIAL_FORMATS, SOCIAL_FORMAT_OVERRIDES, MAGIC_RESIZE_TEST_FORMATS } from "./formats";
import { boundsOf } from "./geometry";
import {
  canRedo,
  canUndo,
  commitHistory,
  createHistory,
  HISTORY_LIMIT,
  pushHistory,
  redoHistory,
  undoHistory,
} from "./history";
import {
  addLayer,
  alignLayers,
  distributeLayers,
  duplicateLayers,
  expandSelection,
  groupLayers,
  moveInStack,
  moveLayers,
  removeLayers,
  reorderLayer,
  ungroup,
} from "./ops";
import { checkSceneFit } from "./resize";
import { sceneSchema, type Layer, type Scene } from "./schema";
import { snapBox, snapTargets } from "./snap";
import { EXAMPLE_SCENES } from "./test-scenes";
import { createStubMeasure } from "./text";

function boxes(): Scene {
  const scene = createScene("square");
  const f = scene.format;
  const at = (id: string, x: number, y: number): Layer => ({
    ...createShapeLayer(id, f, "rect"),
    x,
    y,
    width: 100,
    height: 100,
  });
  return {
    ...scene,
    layers: [
      EXAMPLE_SCENES.announcement().layers[0] as Layer,
      at("a", 0, 0),
      at("b", 300, 200),
      at("c", 900, 500),
    ],
  };
}

const ids = (scene: Scene) => scene.layers.map((l) => l.id);

describe("formats", () => {
  it("match the size catalogue (except the documented working sizes)", () => {
    for (const format of SOCIAL_FORMATS) {
      const preset = SIZE_PRESETS.find((p) => p.id === format.id);
      expect(preset, format.id).toBeDefined();
      expect(preset?.group).toBe("social");
      if (SOCIAL_FORMAT_OVERRIDES.has(format.id)) {
        expect(format.width / format.height).toBeCloseTo(
          (preset as { width: number; height: number }).width /
            (preset as { width: number; height: number }).height,
          5,
        );
      } else {
        expect([format.width, format.height]).toEqual([
          (preset as { width: number; height: number }).width,
          (preset as { width: number; height: number }).height,
        ]);
      }
    }
    expect(MAGIC_RESIZE_TEST_FORMATS).toHaveLength(6);
    expect(SOCIAL_FORMATS.find((f) => f.id === "youtube-thumbnail")).toMatchObject({
      width: 1280,
      height: 720,
    });
  });
});

describe("scene ops", () => {
  it("keeps the background at the bottom", () => {
    const scene = boxes();
    expect(ids(reorderLayer(scene, "c", 0))).toEqual(["bg", "c", "a", "b"]);
    expect(reorderLayer(scene, "bg", 3)).toBe(scene);
    expect(ids(moveInStack(scene, "a", "top"))).toEqual(["bg", "b", "c", "a"]);
    expect(ids(moveInStack(scene, "c", "bottom"))).toEqual(["bg", "c", "a", "b"]);
    expect(ids(moveInStack(scene, "a", "down"))).toEqual(ids(scene));
    const bg2 = { ...(scene.layers[0] as Layer), id: "bg2" } as Layer;
    expect(ids(addLayer(scene, bg2))).toEqual(["bg2", "a", "b", "c"]);
    const t = createTextLayer("t", scene.format, "x");
    expect(ids(addLayer(scene, t, "a"))).toEqual(["bg", "a", "t", "b", "c"]);
  });

  it("groups, expands selections and dissolves groups that lose members", () => {
    let scene = groupLayers(boxes(), ["a", "b", "bg"], { id: "g", name: "Gruppe" });
    expect(scene.groups).toHaveLength(1);
    expect(scene.layers.find((l) => l.id === "bg")?.groupId).toBeNull();
    expect(expandSelection(scene, ["a"])).toEqual(["a", "b"]);
    expect(sceneSchema.safeParse(scene).success).toBe(true);
    expect(ungroup(scene, "g").groups).toEqual([]);
    scene = removeLayers(scene, ["b"]);
    expect(scene.groups).toEqual([]);
    expect(scene.layers.find((l) => l.id === "a")?.groupId).toBeNull();
    expect(groupLayers(boxes(), ["a"], { id: "g", name: "" })).toEqual(boxes());
  });

  it("moves unlocked layers only, duplicates with new ids", () => {
    let scene = boxes();
    scene = {
      ...scene,
      layers: scene.layers.map((l) => (l.id === "b" ? { ...l, locked: true } : l)),
    };
    const moved = moveLayers(scene, ["a", "b", "bg"], 10, 1);
    expect(moved.layers.find((l) => l.id === "a")).toMatchObject({ x: 10, y: 1 });
    expect(moved.layers.find((l) => l.id === "b")).toMatchObject({ x: 300, y: 200 });
    expect(moved.layers.find((l) => l.id === "bg")).toMatchObject({ x: 0, y: 0 });
    let n = 0;
    const dup = duplicateLayers(scene, ["a", "c"], () => `n${++n}`);
    expect(ids(dup.scene)).toEqual(["bg", "a", "b", "c", "n1", "n2"]);
    expect(dup.ids).toEqual(["n1", "n2"]);
    expect(sceneSchema.safeParse(dup.scene).success).toBe(true);
  });

  it("aligns one layer to the canvas and several to their box", () => {
    const scene = boxes();
    const one = alignLayers(scene, ["b"], "right");
    expect(one.layers.find((l) => l.id === "b")?.x).toBe(980);
    const centred = alignLayers(scene, ["b"], "vcenter");
    expect(centred.layers.find((l) => l.id === "b")?.y).toBe(490);
    const many = alignLayers(scene, ["a", "b", "c"], "top");
    expect(many.layers.filter((l) => l.kind === "shape").map((l) => l.y)).toEqual([0, 0, 0]);
    const spread = distributeLayers(scene, ["a", "b", "c"], "x");
    const xs = spread.layers.filter((l) => l.kind === "shape").map((l) => l.x);
    expect(xs).toEqual([0, 450, 900]);
  });

  it("infers anchors from the position", () => {
    const f = { width: 1080, height: 1080 };
    expect(inferConstraints({ x: 10, y: 10, width: 100, height: 100 }, f)).toMatchObject({
      h: "start",
      v: "start",
    });
    expect(inferConstraints({ x: 900, y: 490, width: 100, height: 100 }, f)).toMatchObject({
      h: "end",
      v: "center",
    });
    expect(inferConstraints({ x: 20, y: 900, width: 1000, height: 100 }, f)).toMatchObject({
      h: "stretch",
      v: "end",
    });
  });
});

describe("checkSceneFit", () => {
  it("reports layers outside and cut text", () => {
    const measure = createStubMeasure();
    const scene = boxes();
    const outside = {
      ...scene,
      layers: scene.layers.map((l) => (l.id === "c" ? { ...l, x: 1000 } : l)),
    };
    expect(checkSceneFit(outside, measure)).toEqual([{ layerId: "c", problem: "outside" }]);
    const bleed = {
      ...outside,
      layers: outside.layers.map((l) =>
        l.id === "c" ? { ...l, constraints: { ...l.constraints, bleed: true } } : l,
      ),
    };
    expect(checkSceneFit(bleed, measure)).toEqual([]);
    const text = {
      ...createTextLayer("t", scene.format, "Ein langer Satz mit vielen Woertern"),
      fontSize: 30,
      width: 300,
      height: 50,
    };
    expect(checkSceneFit({ ...scene, layers: [{ ...text, x: 100 }] }, measure)).toEqual([
      { layerId: "t", problem: "text-cut" },
    ]);
    const word = { ...text, text: "Donaudampfschifffahrtsgesellschaft", height: 1000 };
    expect(checkSceneFit({ ...scene, layers: [{ ...word, y: 0 }] }, measure)).toEqual([
      { layerId: "t", problem: "word-overflow" },
    ]);
  });
});

describe("history", () => {
  it("undoes, redoes and merges changes with the same key", () => {
    let h = createHistory(0);
    h = pushHistory(h, 1, 0, "drag");
    h = pushHistory(h, 2, 100, "drag");
    h = pushHistory(h, 3, 300, "drag");
    expect(h.past).toEqual([0]);
    h = pushHistory(h, 4, 2000, "drag");
    expect(h.past).toEqual([0, 3]);
    h = commitHistory(h);
    h = pushHistory(h, 5, 2100, "drag");
    expect(h.past).toEqual([0, 3, 4]);
    h = undoHistory(h);
    expect(h.present).toBe(4);
    expect(canRedo(h)).toBe(true);
    h = redoHistory(h);
    expect(h.present).toBe(5);
    h = pushHistory(undoHistory(h), 9, 3000);
    expect(canRedo(h)).toBe(false);
    expect(pushHistory(h, 9, 4000)).toBe(h);
  });

  it("keeps at most the limit", () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = pushHistory(h, i, i * 1000);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    let steps = 0;
    while (canUndo(h)) {
      h = undoHistory(h);
      steps++;
    }
    expect(steps).toBe(HISTORY_LIMIT);
  });
});

describe("snapping", () => {
  it("snaps edges and centres to the canvas and other layers", () => {
    const scene = boxes();
    const targets = snapTargets(scene, new Set(["b"]));
    const centre = snapBox({ x: 487, y: 205, width: 100, height: 100 }, targets, 6);
    expect(centre.dx).toBe(3);
    expect(centre.guides).toContainEqual({ axis: "x", position: 540 });
    const edge = snapBox({ x: 104, y: 703, width: 100, height: 100 }, targets, 6);
    expect(edge.dx).toBe(-4);
    expect(edge.guides).toContainEqual({ axis: "x", position: 100 });
    expect(snapBox({ x: 150, y: 333, width: 10, height: 10 }, targets, 6)).toEqual({
      dx: 0,
      dy: 0,
      guides: [],
    });
    // Rotated layers snap by their bounds.
    const rotated = { ...(scene.layers[1] as Layer), rotation: 45 };
    expect(boundsOf(rotated).width).toBeCloseTo(141.42, 1);
  });
});
