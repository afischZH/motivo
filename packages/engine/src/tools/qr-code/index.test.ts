import { describe, expect, it } from "vitest";
import {
  QR_EYE_SHAPES,
  QR_MODULE_SHAPES,
  alignmentPositions,
  encodeQr,
  inEye,
  logoHole,
  qrCapacityBytes,
  qrCodeSvg,
  utf8Bytes,
  type QrCodeOptions,
} from "./index";

// Reference values from the capacity table of ISO/IEC 18004 (byte mode).
describe("qr encoder", () => {
  it("knows the byte capacity of the standard", () => {
    expect(qrCapacityBytes(1, "L")).toBe(17);
    expect(qrCapacityBytes(1, "H")).toBe(7);
    expect(qrCapacityBytes(10, "M")).toBe(213);
    expect(qrCapacityBytes(40, "L")).toBe(2953);
    expect(qrCapacityBytes(40, "H")).toBe(1273);
  });

  it("places the alignment patterns of the standard", () => {
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(2)).toEqual([6, 18]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
    expect(alignmentPositions(40)).toEqual([6, 30, 58, 86, 114, 142, 170]);
  });

  it("picks the smallest version that fits", () => {
    const short = encodeQr("a".repeat(17), "L");
    const longer = encodeQr("a".repeat(18), "L");
    expect(short.ok && short.matrix.version).toBe(1);
    expect(longer.ok && longer.matrix.version).toBe(2);
  });

  it("refuses text longer than version 40 holds", () => {
    expect(encodeQr("a".repeat(2954), "L")).toEqual({ ok: false, error: "tooLong" });
  });

  it("draws finder patterns, timing and the dark module", () => {
    const r = encodeQr("https://musterli.app", "M");
    if (!r.ok) throw new Error("encode failed");
    const { modules, size } = r.matrix;
    const at = (x: number, y: number) => (modules[y] as boolean[])[x];
    // Finder corners and centres.
    expect([at(0, 0), at(6, 6), at(3, 3), at(1, 1)]).toEqual([true, true, true, false]);
    expect(at(size - 1, 0)).toBe(true);
    expect(at(0, size - 1)).toBe(true);
    // Timing pattern alternates between the finders.
    for (let i = 8; i < size - 8; i++) expect(at(i, 6)).toBe(i % 2 === 0);
    // The module next to the bottom-left format area is always dark.
    expect(at(8, size - 8)).toBe(true);
  });

  it("is deterministic and honours a forced mask", () => {
    const a = encodeQr("Grüezi", "Q", { mask: 3 });
    const b = encodeQr("Grüezi", "Q", { mask: 3 });
    expect(a).toEqual(b);
    expect(a.ok && a.matrix.mask).toBe(3);
  });

  it("encodes UTF-8 like TextEncoder", () => {
    expect(utf8Bytes("abc")).toEqual([0x61, 0x62, 0x63]);
    expect(utf8Bytes("ü")).toEqual([0xc3, 0xbc]);
    expect(utf8Bytes("✓")).toEqual([0xe2, 0x9c, 0x93]);
    expect(utf8Bytes("😀")).toEqual([0xf0, 0x9f, 0x98, 0x80]);
    // A lone surrogate becomes U+FFFD.
    expect(utf8Bytes("\ud800x")).toEqual([0xef, 0xbf, 0xbd, 0x78]);
  });
});

describe("qr code svg", () => {
  const base: QrCodeOptions = {
    text: "https://musterli.app",
    ecLevel: "M",
    moduleShape: "square",
    eyeShape: "square",
    colors: ["#111111"],
    gradientAngle: 0,
    eyeColor: "#111111",
    background: "#ffffff",
    margin: 4,
    logoHref: null,
    logoSize: 20,
    width: 400,
    height: 400,
  };

  it.each(QR_MODULE_SHAPES.flatMap((m) => QR_EYE_SHAPES.map((e) => [m, e] as const)))(
    "renders %s modules with %s eyes",
    (moduleShape, eyeShape) => {
      const { svg, matrix } = qrCodeSvg({ ...base, moduleShape, eyeShape });
      expect(matrix).not.toBeNull();
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).not.toContain("NaN");
    },
  );

  it("draws only the background when the text is empty or too long", () => {
    expect(qrCodeSvg({ ...base, text: "" }).matrix).toBeNull();
    const long = qrCodeSvg({ ...base, ecLevel: "H", text: "a".repeat(1300) });
    expect(long.matrix).toBeNull();
    expect(long.svg).not.toContain("<path");
  });

  it("uses a gradient for two or more colours", () => {
    expect(qrCodeSvg({ ...base, colors: ["#111111", "#7c3aed"] }).svg).toContain("linearGradient");
  });

  it("escapes the logo address and leaves a hole for it", () => {
    const { svg } = qrCodeSvg({ ...base, logoHref: 'data:image/png;base64,AA"' });
    expect(svg).toContain("&quot;");
    const hole = logoHole(25, 20);
    expect(hole).not.toBeNull();
    if (hole) expect(hole.to - hole.from).toBeCloseTo(6, 6);
  });

  it("recognises the eye areas", () => {
    expect(inEye(0, 0, 21)).toBe(true);
    expect(inEye(20, 0, 21)).toBe(true);
    expect(inEye(0, 20, 21)).toBe(true);
    expect(inEye(20, 20, 21)).toBe(false);
    expect(inEye(10, 10, 21)).toBe(false);
  });
});
