/** M4b-AP07: pure helpers of the live view (frames over the preview, capture crop). */
import { describe, expect, it } from "vitest";
import { LIVE_FRAME_SANDBOX, cropOfViewport, occluderMask, radiiPercent } from "./live-view";

const frame = {
  x: 100,
  y: 50,
  width: 200,
  height: 400,
  radii: [20, 20, 40, 40] as const,
  occluders: [] as string[],
};

describe("live view helpers", () => {
  it("sandboxes frames without top navigation or downloads", () => {
    expect(LIVE_FRAME_SANDBOX.split(" ").sort()).toEqual([
      "allow-forms",
      "allow-popups",
      "allow-same-origin",
      "allow-scripts",
    ]);
  });

  it("scales the corner radii with the preview (percent per axis)", () => {
    expect(radiiPercent(frame)).toBe("10% 10% 20% 20% / 5% 5% 10% 10%");
  });

  it("masks the parts painted on top, in the frame's own coordinates", () => {
    expect(occluderMask(frame)).toBeNull();
    const mask = occluderMask({ ...frame, occluders: ["M0 0h10v10Z", "M5 5h1v1Z"] }) ?? "";
    const svg = decodeURIComponent(mask.slice(mask.indexOf(",") + 1, -2));
    expect(svg).toContain('viewBox="100 50 200 400"');
    expect(svg).toContain('d="M0 0h10v10ZM5 5h1v1Z" fill="#000"');
    expect(svg).toContain('mask="url(#m)"');
  });

  it("maps an element rect to the captured video, clamped to it", () => {
    const viewport = { width: 1280, height: 720 };
    expect(
      cropOfViewport({ x: 100, y: 50, width: 200, height: 100 }, viewport, {
        width: 2560,
        height: 1440,
      }),
    ).toEqual({ x: 200, y: 100, width: 400, height: 200 });
    expect(
      cropOfViewport({ x: 1200, y: -10, width: 200, height: 100 }, viewport, {
        width: 1280,
        height: 720,
      }),
    ).toEqual({ x: 1200, y: 0, width: 80, height: 100 });
  });
});
