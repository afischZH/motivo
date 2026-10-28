import { describe, expect, it, vi } from "vitest";
import { prepareBrandImage } from "./prepare";

/** A 1x1 PNG. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const pngFile = () => {
  const binary = atob(PNG_1X1);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new File([bytes], "logo.png", { type: "image/png" });
};

const services = () => ({
  crop: vi.fn(async () => ({
    ok: true as const,
    href: `data:image/png;base64,${PNG_1X1}`,
    width: 1,
    height: 1,
  })),
});

describe("prepareBrandImage", () => {
  it("sanitises SVG logos and reports what was removed", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" onload="alert(1)"><script>alert(1)</script><rect width="20" height="10"/></svg>';
    const result = await prepareBrandImage(
      new File([svg], "evil.svg", { type: "image/svg+xml" }),
      "logo",
      services(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.image.kind !== "svg") throw new Error("expected svg");
    expect(result.removed).toBeGreaterThan(0);
    expect(result.image.svg).not.toMatch(/script|onload/i);
    expect(result.image).toMatchObject({ width: 20, height: 10, name: "evil.svg" });
  });

  it("re-encodes raster logos through the image service, whole picture", async () => {
    const s = services();
    const result = await prepareBrandImage(pngFile(), "logo", s);
    expect(result).toMatchObject({ ok: true, image: { kind: "raster", width: 1, height: 1 } });
    expect(s.crop).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "image/png",
      { x: 0, y: 0, width: 1, height: 1 },
      1024,
    );
  });

  it("accepts only SVG for shapes and checks types by content", async () => {
    expect(await prepareBrandImage(pngFile(), "shape", services())).toEqual({
      ok: false,
      error: "shape-not-svg",
    });
    // A text file named .png is refused by its bytes.
    const fake = new File(["hello"], "fake.png", { type: "image/png" });
    expect(await prepareBrandImage(fake, "logo", services())).toEqual({
      ok: false,
      error: "unsupported-type",
    });
  });
});
