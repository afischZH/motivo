/**
 * Example scenes for tests (and a reference for templates in AP05). Pure
 * data built with the factories; not part of the package entry.
 */
import {
  createBackgroundLayer,
  createLogoLayer,
  createScene,
  createShapeLayer,
  createTextLayer,
} from "./factory";
import type { Layer, Scene, SceneImage } from "./schema";

/** A 1 x 1 PNG (valid data URI) standing in for a user's picture. */
export const TEST_PNG: SceneImage = {
  kind: "raster",
  href: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==",
  width: 400,
  height: 200,
  name: "logo.png",
};

function background(scene: Scene): Layer {
  return createBackgroundLayer("bg", scene.format, {
    id: "mesh-gradient",
    version: 1,
    params: {},
  });
}

/** Headline, subline, logo, a decorative circle bleeding off the corner. */
export function announcementScene(): Scene {
  const scene = createScene("square");
  const f = scene.format;
  const headline = {
    ...createTextLayer("headline", f, "Neue Kollektion ab heute online", { fontSize: 96 }),
    x: 90,
    y: 300,
    width: 900,
    height: 240,
    constraints: { h: "stretch", v: "center", size: "short", bleed: false },
  } satisfies Layer;
  const subline = {
    ...createTextLayer("subline", f, "Nur solange der Vorrat reicht. Jetzt entdecken!", {
      fontSize: 44,
      fontWeight: 400,
    }),
    x: 140,
    y: 580,
    width: 800,
    height: 120,
    minFontSize: 24,
  } satisfies Layer;
  const circle = {
    ...createShapeLayer("deco", f, "ellipse"),
    x: 820,
    y: -120,
    width: 400,
    height: 400,
    constraints: { h: "end", v: "start", size: "short", bleed: true },
  } satisfies Layer;
  const logo = createLogoLayer("logo", f, TEST_PNG, null, "Logo");
  return { ...scene, layers: [background(scene), circle, headline, subline, logo] };
}

/** A story-like layout: title on top, a button (group of shape and text) at the bottom. */
export function buttonScene(): Scene {
  const scene = createScene("story");
  const f = scene.format;
  const title = {
    ...createTextLayer("title", f, "Workshop: Gestalten mit Mustern und Farben", { fontSize: 120 }),
    x: 80,
    y: 260,
    width: 920,
    height: 600,
    constraints: { h: "stretch", v: "start", size: "short", bleed: false },
  } satisfies Layer;
  const button = {
    ...createShapeLayer("button", f, "rect"),
    x: 290,
    y: 1560,
    width: 500,
    height: 140,
    cornerRadius: 70,
    groupId: "cta",
  } satisfies Layer;
  const label = {
    ...createTextLayer("label", f, "Jetzt anmelden", { fontSize: 56, color: "#ffffff" }),
    x: 310,
    y: 1590,
    width: 460,
    height: 80,
    groupId: "cta",
  } satisfies Layer;
  const line = {
    ...createShapeLayer("rule", f, "line"),
    x: 80,
    y: 920,
    width: 920,
    height: 8,
  } satisfies Layer;
  return {
    ...scene,
    layers: [background(scene), title, line, button, label],
    groups: [
      {
        id: "cta",
        name: "Button",
        constraints: { h: "center", v: "end", size: "short", bleed: false },
      },
    ],
  };
}

/** Landscape: text column on the left, a picture on the right, a rotated badge. */
export function splitScene(): Scene {
  const scene = createScene("linkedin-post");
  const f = scene.format;
  const text = {
    ...createTextLayer(
      "copy",
      f,
      "Wie wir unsere Markenfarben in zwei Wochen neu gedacht haben\nEin Erfahrungsbericht",
      { fontSize: 52, align: "left" },
    ),
    x: 60,
    y: 120,
    width: 560,
    height: 380,
    minFontSize: 20,
  } satisfies Layer;
  const picture = {
    ...createShapeLayer("photo", f, "rect"),
    x: 680,
    y: 60,
    width: 460,
    height: 507,
    constraints: { h: "end", v: "stretch", size: "height", bleed: false },
  } satisfies Layer;
  const badge = {
    ...createShapeLayer("badge", f, "library", "star"),
    x: 560,
    y: 420,
    width: 160,
    height: 160,
    rotation: 15,
  } satisfies Layer;
  return { ...scene, layers: [background(scene), picture, text, badge] };
}

/** One long paragraph that must wrap and shrink in narrow formats. */
export function longTextScene(): Scene {
  const scene = createScene("portrait");
  const f = scene.format;
  const words =
    "Musterli ist eine Werkzeugkiste fuer Muster, Verlaeufe und Hintergruende. Alles laeuft im Browser, nichts verlaesst dein Geraet, und jeder Export gehoert dir. Probier verschiedene Formate aus und schau, wie sich der Text anpasst.";
  const text = {
    ...createTextLayer("paragraph", f, words, { fontSize: 64, fontWeight: 400, align: "left" }),
    x: 80,
    y: 200,
    width: 920,
    height: 950,
    minFontSize: 28,
    constraints: { h: "stretch", v: "stretch", size: "short", bleed: false },
  } satisfies Layer;
  return { ...scene, layers: [background(scene), text] };
}

export const EXAMPLE_SCENES = {
  announcement: announcementScene,
  button: buttonScene,
  split: splitScene,
  longText: longTextScene,
} as const;
