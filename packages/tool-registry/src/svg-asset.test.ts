import { sanitizeSvg } from "@motivo/svg-sanitizer";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearSvgAssetCache,
  prepareSvgAsset,
  primeSvgAsset,
  recolorSvgAsset,
  svgAssetFor,
} from "./svg-asset";

const wrap = (body: string, root = 'viewBox="0 0 40 20"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${root}>${body}</svg>`;

const ok = (input: string): string => {
  const r = sanitizeSvg(input);
  if (!r.ok) throw new Error(r.error);
  return r.svg;
};

/** Sanitised inputs covering every recoloured attribute and look-alike values. */
const CORPUS = [
  wrap('<rect width="40" height="20"/>'),
  wrap('<rect width="40" height="20" fill="#000000" stroke="#ffffff"/>'),
  wrap(
    '<defs><linearGradient id="g"><stop offset="0" stop-color="#f00" stop-opacity="0.5"/>' +
      '<stop offset="1" stop-color="#00f"/></linearGradient></defs>' +
      '<rect width="40" height="20" fill="url(#g)"/><circle r="4" fill="none" stroke="red"/>',
  ),
  wrap(
    '<defs><filter id="f"><feFlood flood-color="#000000"/><feDiffuseLighting lighting-color="#fff"/>' +
      '</filter></defs><g id="000000" color="#123"><use href="#000000"/></g>',
  ),
  wrap('<text x="1" y="10" fill="transparent">="#000000" #ffffff</text>', 'width="40" height="20"'),
  wrap('<style>.a{fill:#000}</style><rect class="a" width="4" height="4"/>'),
].map(ok);

afterEach(() => clearSvgAssetCache());

describe("prepareSvgAsset", () => {
  it("recolours exactly like the sanitizer, for any colour", () => {
    for (const input of CORPUS) {
      const prepared = prepareSvgAsset(input);
      expect(prepared).not.toBeNull();
      if (!prepared) continue;
      expect(prepared.recolorParts).not.toBeNull();
      expect(prepared.svg).toBe(input);
      for (const color of ["#000000", "#FFFFFF", "#1e90ff", "#abc", "#0F0"]) {
        const expected = sanitizeSvg(input, { recolor: color });
        expect(expected.ok).toBe(true);
        if (!expected.ok) continue;
        expect(recolorSvgAsset(prepared, color)).toBe(expected.svg);
      }
    }
  });

  it("rejects what the sanitizer rejects and invalid colours", () => {
    expect(prepareSvgAsset("<html/>")).toBeNull();
    expect(prepareSvgAsset(wrap("", ""))).toBeNull();
    const prepared = prepareSvgAsset(CORPUS[0] ?? "");
    expect(prepared && recolorSvgAsset(prepared, "red")).toBeNull();
    expect(prepared && recolorSvgAsset(prepared, '#000" onload="x')).toBeNull();
  });

  it("falls back to the sanitizer without a template", () => {
    const prepared = prepareSvgAsset(CORPUS[2] ?? "");
    if (!prepared) throw new Error("expected prepared");
    const expected = sanitizeSvg(prepared.input, { recolor: "#123456" });
    expect(recolorSvgAsset({ ...prepared, recolorParts: null }, "#123456")).toBe(
      expected.ok ? expected.svg : "",
    );
  });

  it("sanitises unsanitised input (hostile parts gone in every output)", () => {
    const hostile = wrap(
      '<script>alert(1)</script><rect width="4" height="4" onclick="x()" fill="red"/>',
    );
    const prepared = prepareSvgAsset(hostile);
    if (!prepared) throw new Error("expected prepared");
    expect(prepared.svg).not.toMatch(/script|onclick/);
    expect(recolorSvgAsset(prepared, "#123456")).not.toMatch(/script|onclick/);
  });
});

describe("svg asset cache", () => {
  it("serves primed entries without preparing again", () => {
    const input = CORPUS[2] ?? "";
    const prepared = prepareSvgAsset(input);
    if (!prepared) throw new Error("expected prepared");
    expect(primeSvgAsset(prepared)).toBe(true);
    expect(svgAssetFor(input)).toBe(prepared);
    // A copy of the same content (e.g. from structured clone) still hits.
    expect(svgAssetFor(input.slice(0))).toBe(prepared);
  });

  it("only accepts canonical sanitizer output", () => {
    const raw = wrap('<rect width="4" height="4" class="x"/>');
    const prepared = prepareSvgAsset(raw);
    if (!prepared) throw new Error("expected prepared");
    expect(prepared.svg).not.toBe(raw);
    expect(primeSvgAsset(prepared)).toBe(false);
    expect(primeSvgAsset({ ...prepared, input: prepared.svg + " " })).toBe(false);
  });

  it("prepares unknown input on demand and evicts the oldest entry", () => {
    const first = svgAssetFor(CORPUS[0] ?? "");
    expect(first?.svg).toBe(CORPUS[0]);
    expect(svgAssetFor(CORPUS[0] ?? "")).toBe(first);
    for (const input of CORPUS.slice(1, 5)) svgAssetFor(input);
    expect(svgAssetFor(CORPUS[0] ?? "")).not.toBe(first);
    expect(svgAssetFor("not svg")).toBeNull();
  });
});
