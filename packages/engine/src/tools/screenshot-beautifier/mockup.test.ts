import { describe, expect, it } from "vitest";
import {
  MOCKUP_ARRANGEMENTS,
  MOCKUP_DEVICES,
  MOCKUP_MODELS,
  mockupCameraPath,
  mockupCrop,
  mockupDisplayUrl,
  mockupLayout,
  mockupScene,
  placeholderWebsite,
  type MockupDevice,
  type MockupPlacement,
} from "./mockup";

const W = 1600;
const H = 900;

const bounds = (p: MockupPlacement) => {
  const m = MOCKUP_MODELS[p.device];
  return { x: p.x, y: p.y, w: m.width * p.scale, h: m.height * p.scale };
};

/** Every non-empty subset of the four devices with at least two of them. */
const SETS: MockupDevice[][] = [];
for (let mask = 1; mask < 16; mask++) {
  const set = MOCKUP_DEVICES.filter((_, i) => mask & (1 << i));
  if (set.length >= 2) SETS.push(set);
}

describe("mockupLayout", () => {
  it("fits a single device as large as the padding allows, centred", () => {
    for (const device of MOCKUP_DEVICES) {
      const [p] = mockupLayout({
        width: W,
        height: H,
        padding: 10,
        align: "center",
        devices: [device],
        arrangement: "cascade",
      });
      if (!p) throw new Error("no placement");
      const b = bounds(p);
      const pad = 0.1 * H;
      expect(b.x).toBeGreaterThanOrEqual(pad - 1e-6);
      expect(b.y).toBeGreaterThanOrEqual(pad - 1e-6);
      expect(b.x + b.w).toBeLessThanOrEqual(W - pad + 1e-6);
      expect(b.y + b.h).toBeLessThanOrEqual(H - pad + 1e-6);
      // Touches the padding on one axis.
      const fillsW = Math.abs(b.w - (W - 2 * pad)) < 1e-6;
      const fillsH = Math.abs(b.h - (H - 2 * pad)) < 1e-6;
      expect(fillsW || fillsH).toBe(true);
      expect(b.x + b.w / 2).toBeCloseTo(W / 2, 6);
    }
  });

  it("keeps every set inside the canvas and as one overlapping group", () => {
    for (const arrangement of MOCKUP_ARRANGEMENTS) {
      for (const devices of SETS) {
        for (const [w, h] of [
          [W, H],
          [1080, 1350],
          [1600, 1600],
        ] as const) {
          const out = mockupLayout({
            width: w,
            height: h,
            padding: 5,
            align: "center",
            devices,
            arrangement,
          });
          expect(out.map((p) => p.device).sort()).toEqual([...devices].sort());
          const bs = out.map(bounds);
          for (const b of bs) {
            expect(b.x).toBeGreaterThanOrEqual(-1e-6);
            expect(b.y).toBeGreaterThanOrEqual(-1e-6);
            expect(b.x + b.w).toBeLessThanOrEqual(w + 1e-6);
            expect(b.y + b.h).toBeLessThanOrEqual(h + 1e-6);
          }
          // Sorted by left edge, each device reaches into the ones before it.
          const sorted = [...bs].sort((a, b) => a.x - b.x);
          let right = sorted[0] ? sorted[0].x + sorted[0].w : 0;
          for (const b of sorted.slice(1)) {
            expect(b.x, `${arrangement} ${devices.join("+")}`).toBeLessThan(right);
            right = Math.max(right, b.x + b.w);
          }
        }
      }
    }
  });

  it("paints the phone last in the full set and keeps relative sizes", () => {
    const out = mockupLayout({
      width: W,
      height: H,
      padding: 5,
      align: "center",
      devices: ["phone", "tablet", "laptop", "desktop"],
      arrangement: "cascade",
    });
    expect(out.map((p) => p.device)).toEqual(["desktop", "laptop", "tablet", "phone"]);
    const [desktop, , , phone] = out;
    if (!desktop || !phone) throw new Error("missing");
    expect(phone.scale / desktop.scale).toBeCloseTo(MOCKUP_MODELS.phone.setScale, 6);
  });

  it("aligns the group within the free space", () => {
    const base = { width: 3000, height: H, padding: 5, devices: ["phone"] as MockupDevice[] };
    const left = mockupLayout({ ...base, align: "left", arrangement: "row" })[0];
    const right = mockupLayout({ ...base, align: "right", arrangement: "row" })[0];
    if (!left || !right) throw new Error("missing");
    expect(left.x).toBeCloseTo(0.05 * H, 6);
    expect(right.x + bounds(right).w).toBeCloseTo(3000 - 0.05 * H, 6);
  });

  it("returns nothing for no devices", () => {
    expect(
      mockupLayout({
        width: W,
        height: H,
        padding: 5,
        align: "center",
        devices: [],
        arrangement: "row",
      }),
    ).toEqual([]);
  });
});

describe("mockupCrop", () => {
  const screen = { x: 10, y: 20, width: 100, height: 200 };

  it("fits a tall full-page screenshot to the width and shows its top", () => {
    const c = mockupCrop(390, 3000, screen);
    expect(c.width).toBeCloseTo(100, 6);
    expect(c.x).toBeCloseTo(10, 6);
    expect(c.y).toBe(20);
    expect(c.height).toBeGreaterThan(200);
  });

  it("covers the screen with a wide screenshot, centred horizontally", () => {
    const c = mockupCrop(1600, 900, screen);
    expect(c.height).toBeCloseTo(200, 6);
    expect(c.y).toBe(20);
    expect(c.x + c.width / 2).toBeCloseTo(60, 6);
  });

  it("never divides by zero", () => {
    const c = mockupCrop(0, 0, screen);
    expect(Number.isFinite(c.width) && Number.isFinite(c.height)).toBe(true);
  });
});

describe("mockupDisplayUrl", () => {
  it("shows the address like a browser bar", () => {
    expect(mockupDisplayUrl("https://example.com/")).toBe("example.com");
    expect(mockupDisplayUrl("  http://example.com/a/  ")).toBe("example.com/a/");
    expect(mockupDisplayUrl("example.com/pricing")).toBe("example.com/pricing");
    expect(mockupDisplayUrl("a\u0000b\u001f  c")).toBe("ab c");
  });
});

describe("placeholderWebsite", () => {
  const cards = (svg: string) => svg.split(' rx="18"').length - 1;

  it("responds to the viewport width like a real page", () => {
    const desktop = placeholderWebsite(1440, 900, "light", "#6366f1");
    const phone = placeholderWebsite(390, 844, "dark", "#6366f1");
    expect(desktop.startsWith('<rect x="0" y="0" width="1440" height="900"')).toBe(true);
    // Three columns of cards on a desktop, one on a phone (plus the menu button).
    expect(cards(desktop) % 3).toBe(0);
    expect(cards(phone)).toBeGreaterThanOrEqual(1);
    expect(phone).toContain('width="26" height="3"');
    expect(desktop).not.toContain('width="26" height="3"');
  });
});

describe("mockupScene", () => {
  const base = {
    width: W,
    height: H,
    padding: 6,
    align: "center" as const,
    arrangement: "cascade" as const,
    backgroundSvg: '<rect width="1600" height="900" fill="#123456"/>',
    finish: "silver" as const,
    camera: "island" as const,
    frame: "browser" as const,
    theme: "light" as const,
    url: "example.com",
    shadow: 60,
    shadowColor: "#000000",
    accent: "#6366f1",
  };
  const href = "data:image/png;base64,AAAA";

  it("draws the placeholder without pictures and lists the screens", () => {
    const scene = mockupScene({ ...base, devices: [...MOCKUP_DEVICES], images: {} });
    expect(scene.layers.every((l) => l.kind === "svg")).toBe(true);
    expect(scene.screens).toHaveLength(4);
    expect(scene.svg).toContain("example.com");
    expect(scene.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1600"')).toBe(true);
  });

  it("puts pictures between the devices in paint order", () => {
    const image = { href, width: 1440, height: 3000 };
    const scene = mockupScene({
      ...base,
      devices: ["laptop", "phone"],
      images: { laptop: image, phone: image },
    });
    expect(scene.layers.map((l) => l.kind)).toEqual(["svg", "picture", "svg", "picture", "svg"]);
    expect(scene.svg.split(href).length - 1).toBe(2);
    // The laptop screen is below the bar: rounded at the bottom only.
    const laptop = scene.layers[1];
    if (laptop?.kind !== "picture") throw new Error("no picture");
    expect(laptop.radii[0]).toBe(0);
    expect(laptop.radii[2]).toBeGreaterThan(0);
  });

  it("draws a camera cut-out only on phones", () => {
    const [phone] = mockupLayout({ ...base, devices: ["phone"] });
    const [tablet] = mockupLayout({ ...base, devices: ["tablet"] });
    if (!phone || !tablet) throw new Error("missing");
    expect(mockupCameraPath(phone, "island")).toMatch(/^M/);
    expect(mockupCameraPath(phone, "notch")).toMatch(/Q/);
    expect(mockupCameraPath(phone, "none")).toBe("");
    expect(mockupCameraPath(tablet, "island")).toBe("");
  });

  it("is deterministic", () => {
    const a = mockupScene({ ...base, devices: [...MOCKUP_DEVICES], images: {} });
    const b = mockupScene({ ...base, devices: [...MOCKUP_DEVICES], images: {} });
    expect(a.svg).toBe(b.svg);
  });
});
