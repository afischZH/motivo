import { describe, expect, it } from "vitest";

import { createImageLayer, createScene, createTextLayer } from "./factory";
import {
  SCENE_IMAGE_MAX_RASTER_LENGTH,
  SCENE_IMAGES_MAX_TOTAL_LENGTH,
  parseEditedScene,
  type Layer,
  type Scene,
  type SceneImage,
} from "./schema";
import { TEST_PNG } from "./test-scenes";

const FORMAT = { id: "square", width: 1080, height: 1080 };
type RasterImage = Extract<SceneImage, { kind: "raster" }>;
const RASTER = TEST_PNG as RasterImage;

function withPicture(image: SceneImage, id = "i1"): Scene {
  return createScene("square", [createImageLayer(id, FORMAT, image)]);
}

describe("parseEditedScene", () => {
  it("accepts an edited scene and keeps the very picture objects", () => {
    const scene = withPicture(TEST_PNG);
    const parsed = parseEditedScene(scene);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const layer = parsed.data.layers[0];
    expect(layer?.kind === "image" && layer.image).toBe(TEST_PNG);
  });

  it("still checks every other field and limit", () => {
    const text = createTextLayer("t1", FORMAT, "Hi");
    const broken = createScene("square", [{ ...text, fontSize: 5000 } as Layer]);
    expect(parseEditedScene(broken).success).toBe(false);
    const duplicate = createScene("square", [text, text]);
    expect(parseEditedScene(duplicate).success).toBe(false);
  });

  it("checks picture data by length and prefix", () => {
    const wrongType = withPicture({ ...RASTER, href: "data:text/html;base64,AAAA" });
    expect(parseEditedScene(wrongType).success).toBe(false);
    const tooLong = withPicture({
      ...RASTER,
      href: `data:image/png;base64,${"A".repeat(SCENE_IMAGE_MAX_RASTER_LENGTH)}`,
    });
    expect(parseEditedScene(tooLong).success).toBe(false);
  });

  it("checks the total size of all pictures", () => {
    const big: SceneImage = {
      ...RASTER,
      href: `data:image/png;base64,${"A".repeat(Math.ceil(SCENE_IMAGES_MAX_TOTAL_LENGTH / 3))}`,
    };
    const layers = [0, 1, 2, 3].map((i) => createImageLayer(`i${i}`, FORMAT, big));
    expect(parseEditedScene(createScene("square", layers)).success).toBe(false);
  });

  it("does not read the picture data again (checked when it entered)", () => {
    // Characters the data URI pattern refuses: never looked at for an edited scene.
    const image: SceneImage = { ...RASTER, href: `data:image/png;base64,${"#".repeat(5_000)}` };
    expect(parseEditedScene(withPicture(image)).success).toBe(true);
  });
});
