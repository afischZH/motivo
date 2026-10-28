import { describe, expect, it } from "vitest";
import {
  PLACEHOLDER_HEIGHT,
  PLACEHOLDER_WIDTH,
  SCREENSHOT_BAR_RATIO,
  fitBarText,
  placeholderScreenshot,
  roundedRectPath,
  screenshotLayout,
  screenshotShadowLayers,
  screenshotScene,
  screenshotSvg,
  type ScreenshotLayoutOptions,
  type ScreenshotOptions,
} from "./index";

const layoutBase: ScreenshotLayoutOptions = {
  width: 1600,
  height: 900,
  padding: 10,
  align: "center",
  aspect: 16 / 10,
  frame: "none",
  border: 0,
  radius: 12,
};

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("screenshotLayout", () => {
  it("fits the window into the canvas minus padding, keeping the aspect ratio", () => {
    const l = screenshotLayout(layoutBase);
    const pad = 0.1 * 900;
    // 16:10 in 1420 × 720: height limits.
    close(l.window.height, 900 - 2 * pad);
    close(l.window.width, (900 - 2 * pad) * 1.6);
    close(l.shot.width / l.shot.height, 1.6);
    close(l.window.x, (1600 - l.window.width) / 2);
    close(l.window.y, pad);
    expect(l.bar).toBeNull();
  });

  it("adds a bar proportional to the width and keeps the screenshot's aspect ratio", () => {
    for (const frame of ["window", "browser"] as const) {
      const l = screenshotLayout({ ...layoutBase, frame });
      expect(l.bar).not.toBeNull();
      close(l.bar?.height ?? 0, l.window.width * SCREENSHOT_BAR_RATIO[frame]);
      close(l.shot.width / l.shot.height, 1.6);
      close(l.shot.y, l.window.y + (l.bar?.height ?? 0));
      close(l.shot.y + l.shot.height, l.window.y + l.window.height);
    }
  });

  it("places the window by alignment in the free space", () => {
    const tall = { ...layoutBase, aspect: 0.5 };
    const pad = 90;
    close(screenshotLayout({ ...tall, align: "left" }).window.x, pad);
    const right = screenshotLayout({ ...tall, align: "right" }).window;
    close(right.x + right.width, 1600 - pad);
    const wide = { ...layoutBase, width: 900, height: 1600, aspect: 3 };
    close(screenshotLayout({ ...wide, align: "top" }).window.y, pad);
    const bottom = screenshotLayout({ ...wide, align: "bottom" }).window;
    close(bottom.y + bottom.height, 1600 - pad);
  });

  it("reserves room for the border and clamps radius and odd inputs", () => {
    const l = screenshotLayout({ ...layoutBase, border: 20, radius: 9999 });
    close(l.window.y, 90 + 20);
    expect(l.radius).toBe(Math.min(l.window.width, l.window.height) / 2);
    const odd = screenshotLayout({
      ...layoutBase,
      padding: Number.NaN,
      aspect: Number.POSITIVE_INFINITY,
      border: -5,
    });
    for (const v of Object.values(odd.window)) expect(Number.isFinite(v)).toBe(true);
    expect(odd.border).toBe(0);
  });
});

describe("helpers", () => {
  it("shortens bar text with an ellipsis", () => {
    expect(fitBarText("  musterli.app  ", 400, 10)).toBe("musterli.app");
    const cut = fitBarText("a".repeat(100), 56, 10);
    expect(cut).toBe(`${"a".repeat(8)}…`);
    expect(fitBarText("abc", 3, 10)).toBe("");
  });

  it("draws rounded rectangles and nothing for empty ones", () => {
    expect(roundedRectPath({ x: 0, y: 0, width: 10, height: 10 }, 0)).toBe("M0 0h10v10h-10Z");
    expect(roundedRectPath({ x: 0, y: 0, width: 10, height: 10 }, 3)).toContain("a3 3 0 0 1");
    expect(roundedRectPath({ x: 0, y: 0, width: 0, height: 10 }, 3)).toBe("");
  });

  it("has no shadow at strength 0 and caps the blur for 8K exports", () => {
    expect(screenshotShadowLayers(0, 1600, 900)).toEqual([]);
    const layers = screenshotShadowLayers(1, 1600, 900);
    expect(layers).toHaveLength(5);
    // Standard deviation (blur / 2) at most 200 px when 1600 px become 8192 px.
    const sigmaAt8k = (Math.max(...layers.map((l) => l.blur)) / 2) * (8192 / 1600);
    expect(sigmaAt8k).toBeLessThanOrEqual(200.5);
    expect(layers.every((l) => l.y >= 0 && l.x === 0)).toBe(true);
  });

  it("draws a placeholder without text for both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const svg = placeholderScreenshot(theme, "#6366f1");
      expect(svg).toContain(`width="${PLACEHOLDER_WIDTH}" height="${PLACEHOLDER_HEIGHT}"`);
      expect(svg).not.toContain("<text");
    }
  });
});

const PNG = "data:image/png;base64,iVBORw0KGgo=";

const base: ScreenshotOptions = {
  ...layoutBase,
  backgroundSvg: '<rect width="1600" height="900" fill="#eeeeee"/>',
  shadow: 50,
  shadowColor: "#000000",
  borderColor: "#ffffff",
  borderOpacity: 30,
  highlight: false,
  theme: "light",
  url: "musterli.app",
  accent: "#6366f1",
};

describe("screenshotSvg", () => {
  it("is deterministic and draws the placeholder without a picture", () => {
    const a = screenshotSvg(base);
    expect(screenshotSvg(base)).toBe(a);
    expect(a).toContain(`viewBox="0 0 ${PLACEHOLDER_WIDTH} ${PLACEHOLDER_HEIGHT}"`);
    expect(a).not.toContain("<image");
    expect(a.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"')).toBe(
      true,
    );
  });

  it("embeds the picture as an image fitted to its own aspect ratio", () => {
    const svg = screenshotSvg({ ...base, image: { href: PNG, width: 400, height: 100 } });
    expect(svg).toContain(`xlink:href="${PNG}"`);
    const m = /<image x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(svg);
    expect(m).not.toBeNull();
    close(Number(m?.[3]) / Number(m?.[4]), 4);
  });

  it("escapes the address and anything unusual in the image reference", () => {
    const hostile = '"><script>alert(1)</script>';
    const svg = screenshotSvg({
      ...base,
      frame: "browser",
      url: hostile,
      width: 3200,
      image: { href: `${PNG}"onload="x`, width: 10, height: 10 },
    });
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain('"onload=');
    expect(svg).toContain("&lt;script&gt;");
  });

  it("draws the bar only with a frame and the rim only when asked", () => {
    expect(screenshotSvg(base)).not.toContain("#ff5f57");
    const framed = screenshotSvg({ ...base, frame: "window", border: 8, highlight: true });
    for (const c of ["#ff5f57", "#febc2e", "#28c840"]) expect(framed).toContain(`fill="${c}"`);
    expect(framed).toContain('stroke="#ffffff" stroke-opacity="0.3" stroke-width="8"');
    expect(framed).toContain('stroke-opacity="0.35"');
    expect(screenshotSvg({ ...base, shadow: 0 })).not.toContain("<filter");
  });

  it("splits the scene into a stage without the picture and a picture layer", () => {
    const plain = screenshotScene(base);
    expect(plain.stageSvg).toBe(plain.svg);
    expect(plain.picture).toBeUndefined();

    const scene = screenshotScene({
      ...base,
      frame: "browser",
      highlight: true,
      image: { href: PNG, width: 400, height: 250 },
    });
    expect(scene.svg).toContain("<image");
    expect(scene.stageSvg).not.toContain("<image");
    expect(scene.stageSvg).not.toContain('stroke-opacity="0.35"');
    expect(scene.stageSvg).toContain("#ff5f57");
    const layer = scene.picture;
    expect(layer).toBeDefined();
    if (!layer) return;
    expect(layer.barHeight).toBeGreaterThan(0);
    expect(layer.highlight).toBeGreaterThanOrEqual(1);
    const m = /<image x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(scene.svg);
    expect(Number(m?.[1])).toBeCloseTo(layer.window.x, 1);
    expect(Number(m?.[2])).toBeCloseTo(layer.window.y + layer.barHeight, 1);
    expect(Number(m?.[3])).toBeCloseTo(layer.window.width, 1);
  });
});
