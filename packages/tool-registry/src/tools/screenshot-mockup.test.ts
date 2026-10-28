/**
 * M4b-AP07: website mockups in the screenshot beautifier (docs/TOOLS.md K6):
 * devices, one screenshot for all devices, layered preview, the address,
 * the live view frames and older params.
 */
import { MOCKUP_DEVICES } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { parseToolParams } from "../randomize";
import { createRenderContext } from "../render";
import { checkSvg, renderStatic } from "../testing";
import type { CssOutput } from "../types";
import {
  MOCKUP_SETS,
  MOCKUP_SET_IDS,
  liveFrames,
  liveUrl,
  looksLikeAddress,
  mockupImages,
  type ScreenshotBeautifierParams,
} from "./screenshot-beautifier";
import { screenshotBeautifierTool as tool } from "./index";

const size = { width: 1600, height: 900 };
const output = (p: Partial<ScreenshotBeautifierParams>, at = size) =>
  renderStatic(tool, { ...tool.defaults, ...p }, 1, at) as CssOutput;

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG2 = PNG.replace("Q", "R");
const PNG3 = PNG.replace("Q", "S");
const shot = (href: string, width = 1440, height = 3200) =>
  ({ kind: "raster", href, width, height, name: "page.png" }) as const;

const count = (text: string, part: string) => text.split(part).length - 1;

describe("devices", () => {
  it("draws every device and set as clean SVG with the placeholder website", () => {
    for (const device of [...MOCKUP_DEVICES, ...MOCKUP_SET_IDS]) {
      const out = output({ device });
      expect(checkSvg(out.previewSvg ?? ""), device).toEqual([]);
      // Without uploads there is no picture layer: the stage is the whole picture.
      expect(out.element).toBeUndefined();
    }
  });

  it("keeps the plain screenshot exactly as before (device: none)", () => {
    const plain = output({ device: "none" });
    const viaDefaults = output({});
    expect(plain).toEqual(viaDefaults);
    expect(plain.previewSvg).toContain('viewBox="0 0 1440 900"');
  });
});

describe("one screenshot is enough", () => {
  it("fills every device of a set with the single upload", () => {
    const p = { ...tool.defaults, device: "responsive" as const, screenshot: shot(PNG) };
    const images = mockupImages(p, MOCKUP_SETS.responsive);
    expect(Object.keys(images).sort()).toEqual([...MOCKUP_SETS.responsive].sort());
    const out = output(p);
    expect(count(out.previewSvg ?? "", `xlink:href="${PNG}"`)).toBe(4);
    expect(checkSvg(out.previewSvg ?? "")).toEqual([]);
  });

  it("uses a phone-only upload on every device too", () => {
    const out = output({ device: "responsive", screenshotPhone: shot(PNG3, 390, 2000) });
    expect(count(out.previewSvg ?? "", PNG3)).toBe(4);
  });

  it("prefers each device's own upload", () => {
    const p = {
      ...tool.defaults,
      device: "responsive" as const,
      screenshot: shot(PNG),
      screenshotTablet: shot(PNG2, 820, 2000),
      screenshotPhone: shot(PNG3, 390, 2000),
    };
    const images = mockupImages(p, MOCKUP_SETS.responsive);
    expect(images.desktop?.href).toBe(PNG);
    expect(images.laptop?.href).toBe(PNG);
    expect(images.tablet?.href).toBe(PNG2);
    expect(images.phone?.href).toBe(PNG3);
    // A single device always shows the main upload.
    expect(mockupImages({ ...p, device: "phone" }, ["phone"]).phone?.href).toBe(PNG);
  });
});

describe("layered preview", () => {
  it("shows pictures as boxes at the place of the SVG images, in paint order", () => {
    const out = output({ device: "responsive", screenshot: shot(PNG) });
    const el = out.element;
    expect(el).toMatchObject({ x: 0, y: 0, width: size.width, height: size.height });
    const boxes = el?.content ?? [];
    const pictures = boxes.filter((b) => b.css.includes(`url("${PNG}")`));
    expect(pictures).toHaveLength(4);
    // Vector parts between the pictures (devices in front) are boxes of their own.
    expect(boxes.length).toBeGreaterThan(pictures.length);
    expect(boxes.at(-1)?.css).toContain("data:image/svg+xml");
    // The stage holds neither the picture nor the devices in front.
    expect(out.css).not.toContain(PNG);
    const images = [
      ...(out.previewSvg ?? "").matchAll(
        /<g clip-path="url\(#(mp[a-z0-9]+)\)"><image x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g,
      ),
    ];
    expect(images).toHaveLength(4);
    images.forEach((m, i) => {
      const box = pictures[i];
      if (!box) throw new Error("missing box");
      const pos = /background-position: ([\d.-]+)px ([\d.-]+)px/.exec(box.css);
      const sz = /background-size: ([\d.]+)px ([\d.]+)px/.exec(box.css);
      expect(box.x + Number(pos?.[1])).toBeCloseTo(Number(m[2]), 1);
      expect(box.y + Number(pos?.[2])).toBeCloseTo(Number(m[3]), 1);
      expect(Number(sz?.[1])).toBeCloseTo(Number(m[4]), 1);
      expect(Number(sz?.[2])).toBeCloseTo(Number(m[5]), 1);
    });
  });

  it("crops the picture to the screen from the top (above the fold)", () => {
    const out = output({ device: "phone", screenshot: shot(PNG, 1440, 900) });
    const box = out.element?.content?.find((b) => b.css.includes(PNG));
    if (!box) throw new Error("no picture box");
    const pos = /background-position: ([\d.-]+)px ([\d.-]+)px/.exec(box.css);
    // A wide picture on a tall phone: height fills, centred horizontally, top aligned.
    expect(Number(pos?.[1])).toBeLessThan(0);
    expect(Number(pos?.[2])).toBe(0);
  });
});

describe("address", () => {
  it("shows the address escaped and without scheme in desktop and laptop bars only", () => {
    const svg =
      output({ device: "laptop", frame: "browser", url: 'https://a.example/<b>"x"' }).previewSvg ??
      "";
    expect(svg).toContain("a.example/&lt;b&gt;&quot;x&quot;");
    expect(svg).not.toContain("https://");
    expect(svg).not.toContain("<b>");
    const phone = output({ device: "phone", url: "only-in-bars.example" }).previewSvg ?? "";
    expect(phone).not.toContain("only-in-bars");
  });

  it("checks addresses gently and builds strict https URLs for the live view", () => {
    expect(liveUrl("example.com")).toBe("https://example.com/");
    expect(liveUrl("https://Example.com/a?b=1#c")).toBe("https://example.com/a?b=1#c");
    for (const bad of [
      "http://example.com",
      "javascript:alert(1)",
      "https://user:pw@example.com",
      "example",
      "exa mple.com",
      "https://-x.example",
      'https://example.com/"onload',
      "",
    ]) {
      expect(liveUrl(bad), bad).toBeNull();
    }
    expect(looksLikeAddress("musterli.app")).toBe(true);
    expect(looksLikeAddress("http://musterli.app/x")).toBe(true);
    expect(looksLikeAddress("Mein Titel")).toBe(false);
  });

  it("hints at addresses that are no web address", () => {
    const ctx = createRenderContext(1, size);
    const hint = (p: Partial<ScreenshotBeautifierParams>) =>
      (tool.advisories?.({ ...tool.defaults, ...p }, ctx) ?? []).map((a) => a.id);
    expect(hint({ device: "laptop", url: "Mein Titel" })).toEqual(["url"]);
    expect(hint({ device: "laptop", url: "example.com" })).toEqual([]);
    expect(hint({ device: "none", url: "Mein Titel" })).toEqual([]);
    expect(hint({ device: "laptop", live: true, url: "http://example.com" })).toEqual(["live-url"]);
  });
});

describe("live view", () => {
  const ctx = createRenderContext(1, size);
  const p = (q: Partial<ScreenshotBeautifierParams>): ScreenshotBeautifierParams => ({
    ...tool.defaults,
    url: "example.com",
    ...q,
  });

  it("has no frames when off, for plain screenshots or without an https address", () => {
    expect(liveFrames(p({ device: "laptop" }), ctx)).toEqual([]);
    expect(liveFrames(p({ device: "none", live: true }), ctx)).toEqual([]);
    expect(liveFrames(p({ device: "laptop", live: true, url: "http://x.example" }), ctx)).toEqual(
      [],
    );
  });

  it("puts one frame per device on its screen, at the device's CSS viewport", () => {
    const frames = liveFrames(p({ device: "responsive", live: true }), ctx);
    expect(frames.map((f) => f.id).sort()).toEqual([...MOCKUP_SETS.responsive].sort());
    for (const f of frames) {
      expect(f.url).toBe("https://example.com/");
      expect(f.viewportHeight / f.viewportWidth).toBeCloseTo(f.height / f.width, 2);
    }
    const byId = new Map(frames.map((f) => [f.id, f]));
    expect(byId.get("phone")?.viewportWidth).toBe(390);
    expect(byId.get("desktop")?.viewportWidth).toBe(1920);
    // Desktop and laptop share the main upload: the larger viewport is captured.
    expect(byId.get("desktop")?.param).toBe("screenshot");
    expect(byId.get("laptop")?.param).toBe("");
    expect(byId.get("tablet")?.param).toBe("screenshotTablet");
    expect(byId.get("phone")?.param).toBe("screenshotPhone");
    // Devices in front mask the frame behind them; the front one has its camera only.
    expect(frames[0]?.occluders).toHaveLength(3);
    expect(frames.at(-1)?.occluders).toHaveLength(1);
    // A capture turns the live view off, so the preview shows the export.
    expect(tool.liveView?.afterCapture).toEqual({ live: false });
  });

  it("captures a single device into the main upload", () => {
    const frames = liveFrames(p({ device: "tablet", live: true }), ctx);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.param).toBe("screenshot");
  });
});

describe("older params", () => {
  it("opens links and designs from before the mockups with the plain screenshot", () => {
    const added = new Set([
      "device",
      "layout",
      "finish",
      "camera",
      "screenshotTablet",
      "screenshotPhone",
      "live",
    ]);
    const old = Object.fromEntries(Object.entries(tool.defaults).filter(([k]) => !added.has(k)));
    const parsed = parseToolParams(tool, old);
    expect(parsed.success).toBe(true);
    expect((parsed.data as ScreenshotBeautifierParams).device).toBe("none");
  });
});
