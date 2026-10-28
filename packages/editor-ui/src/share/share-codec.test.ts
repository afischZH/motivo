import { createRng } from "@musterli/engine";
import {
  builtInTools,
  createRegistry,
  cssGradientTool,
  cssPatternsTool,
  paletteFromImageTool,
  seamlessPatternsTool,
  withoutDerivedParams,
  type AnyToolDefinition,
} from "@musterli/tool-registry";
import { deflateSync, inflateSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createEditorStore, selectDesign, type Design } from "../store/editor-store";
import {
  SHARE_FORMAT_VERSION,
  SHARE_MAX_DECODED_BYTES,
  SHARE_MAX_ENCODED_LENGTH,
  decodeDesign,
  designFromHash,
  designToHash,
  encodeDesign,
  type ShareDecodeResult,
} from "./share-codec";

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const base64urlDecode = (text: string): Uint8Array =>
  Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** Builds a code from arbitrary bytes after the version byte. */
function packRaw(payload: Uint8Array, version = SHARE_FORMAT_VERSION): string {
  const bytes = new Uint8Array(payload.length + 1);
  bytes[0] = version;
  bytes.set(payload, 1);
  return base64url(bytes);
}

/** Builds a code from any JSON value, bypassing encode-side validation. */
const packJson = (value: unknown, version?: number): string =>
  packRaw(deflateSync(new TextEncoder().encode(JSON.stringify(value))), version);

function encodeOk(design: Design): string {
  const r = encodeDesign(design);
  if (!r.ok) throw new Error(`encode failed: ${r.error}`);
  return r.value;
}

function errorOf(r: ShareDecodeResult): string | undefined {
  return r.ok ? undefined : r.error;
}

const design = (tool: AnyToolDefinition, over: Partial<Design> = {}): Design => ({
  toolId: tool.id,
  params: tool.defaults,
  seed: 1,
  size: { width: 1080, height: 1080 },
  ...over,
});

describe.each(builtInTools.map((t) => [t.id, t] as const))("round trip: %s", (_, tool) => {
  const cases: Design[] = [
    design(tool),
    design(tool, { seed: 0, size: { width: 16, height: 8192 } }),
    design(tool, { seed: 0xffffffff, size: { width: 3840, height: 2160 } }),
    ...tool.presets.map((p, i) =>
      design(tool, { params: p.params, seed: (p.seed ?? i * 7919) >>> 0 }),
    ),
  ];

  it.each(cases.map((d, i) => [i, d] as const))("case %i", (_, d) => {
    const code = encodeOk(d);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const r = decodeDesign(code);
    // Image-derived params never travel in a link; they come back as defaults.
    const expected = { ...d, params: withoutDerivedParams(tool, d.params) };
    expect(r).toEqual({ ok: true, design: expected, toolVersion: tool.version, outdated: false });
  });

  it("stays short (defaults under 400 characters)", () => {
    expect(encodeOk(design(tool)).length).toBeLessThan(400);
  });

  it("round-trips randomised variants", () => {
    const rng = createRng(123);
    let params = tool.defaults;
    for (let i = 0; i < 20; i++) {
      params = tool.randomize(rng, params, new Set());
      const d = design(tool, { params, seed: Math.floor(rng.next() * 2 ** 32) });
      expect(decodeDesign(encodeOk(d))).toMatchObject({ ok: true, design: d });
    }
  });
});

describe("encodeDesign", () => {
  it("rejects invalid designs instead of producing broken links", () => {
    const tool = cssGradientTool;
    expect(encodeDesign(design(tool, { toolId: "nope" }))).toEqual({
      ok: false,
      error: "unknown-tool",
    });
    expect(encodeDesign(design(tool, { params: { ...tool.defaults, angle: 999 } }))).toEqual({
      ok: false,
      error: "invalid-params",
    });
    expect(encodeDesign(design(tool, { seed: -1 }))).toEqual({ ok: false, error: "invalid-seed" });
    expect(encodeDesign(design(tool, { size: { width: 0, height: 10 } }))).toEqual({
      ok: false,
      error: "invalid-size",
    });
  });

  it("drops unknown param keys", () => {
    const d = design(cssGradientTool, { params: { ...cssGradientTool.defaults, extra: "x" } });
    const r = decodeDesign(encodeOk(d));
    expect(r.ok && Object.keys(r.design.params)).not.toContain("extra");
  });

  it("reports outdated tool versions", () => {
    const code = encodeOk(design(cssGradientTool));
    const newer = createRegistry();
    newer.register({ ...cssGradientTool, version: cssGradientTool.version + 1 });
    expect(decodeDesign(code, newer)).toMatchObject({ ok: true, outdated: true, toolVersion: 1 });
  });

  it("uses the given registry", () => {
    const empty = createRegistry();
    expect(encodeDesign(design(cssGradientTool), empty)).toEqual({
      ok: false,
      error: "unknown-tool",
    });
    expect(decodeDesign(encodeOk(design(cssGradientTool)), empty)).toEqual({
      ok: false,
      error: "unknown-tool",
    });
  });
});

describe("decodeDesign rejects", () => {
  const valid = (): unknown[] => ["css-gradient", 1, 1, 100, 100, cssGradientTool.defaults];

  it("empty, oversized and non-base64url input", () => {
    expect(errorOf(decodeDesign(""))).toBe("empty");
    expect(errorOf(decodeDesign("   "))).toBe("empty");
    expect(errorOf(decodeDesign("A".repeat(SHARE_MAX_ENCODED_LENGTH + 1)))).toBe("too-long");
    for (const s of ["abc=", "a b", "a+b", "a/b", "ä", "<script>", "%41%42"]) {
      expect(errorOf(decodeDesign(s)), s).toBe("malformed");
    }
    expect(errorOf(decodeDesign(null as unknown as string))).toBe("malformed");
    expect(errorOf(decodeDesign(42 as unknown as string))).toBe("malformed");
  });

  it("other format versions", () => {
    expect(errorOf(decodeDesign(packJson(valid(), 0)))).toBe("unsupported-version");
    expect(errorOf(decodeDesign(packJson(valid(), 2)))).toBe("unsupported-version");
    expect(errorOf(decodeDesign(packJson(valid())))).toBeUndefined();
  });

  it("corrupt deflate data, bad UTF-8 and bad JSON", () => {
    expect(errorOf(decodeDesign(packRaw(new Uint8Array([1, 2, 3, 4, 5]))))).toBe("malformed");
    expect(errorOf(decodeDesign(packRaw(deflateSync(new Uint8Array([0xff, 0xfe])))))).toBe(
      "malformed",
    );
    expect(errorOf(decodeDesign(packRaw(deflateSync(new TextEncoder().encode("[1,")))))).toBe(
      "malformed",
    );
    expect(errorOf(decodeDesign("AQ"))).toBe("malformed");
  });

  it("deflate bombs beyond the decompressed limit", () => {
    const bomb = packRaw(deflateSync(new Uint8Array(SHARE_MAX_DECODED_BYTES * 16).fill(32)));
    expect(bomb.length).toBeLessThan(SHARE_MAX_ENCODED_LENGTH);
    expect(errorOf(decodeDesign(bomb))).toBe("too-long");
  });

  it("wrong JSON shapes", () => {
    const shapes: unknown[] = [
      null,
      42,
      "x",
      {},
      [],
      valid().slice(0, 5),
      [...valid(), 1],
      [1, 1, 1, 100, 100, {}],
      ["css-gradient", "1", 1, 100, 100, {}],
      ["css-gradient", 0, 1, 100, 100, {}],
      ["css-gradient", 1.5, 1, 100, 100, {}],
    ];
    for (const s of shapes)
      expect(errorOf(decodeDesign(packJson(s))), JSON.stringify(s)).toBe("malformed");
  });

  it("unknown tools, including prototype keys", () => {
    for (const id of ["nope", "__proto__", "constructor", "toString", ""]) {
      const v = valid();
      v[0] = id;
      expect(errorOf(decodeDesign(packJson(v))), id).toBe("unknown-tool");
    }
  });

  it("params that fail the tool schema", () => {
    const bad: unknown[] = [
      null,
      [],
      "x",
      { ...cssGradientTool.defaults, angle: "90" },
      { ...cssGradientTool.defaults, palette: ["#fff"] },
      { ...cssGradientTool.defaults, palette: ["javascript:alert(1)", "#000"] },
      { ...cssGradientTool.defaults, type: "diamond" },
      { palette: ["#fff", "#000"] },
    ];
    for (const p of bad) {
      const v = valid();
      v[5] = p;
      expect(errorOf(decodeDesign(packJson(v))), JSON.stringify(p)).toBe("invalid-params");
    }
  });

  it("does not let __proto__ in params leak through", () => {
    const json = JSON.stringify(valid()).replace(
      '{"palette"',
      '{"__proto__":{"polluted":1},"palette"',
    );
    const r = decodeDesign(packRaw(deflateSync(new TextEncoder().encode(json))));
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (r.ok) expect(Object.getPrototypeOf(r.design.params)).toBe(Object.prototype);
  });

  it("invalid seeds and sizes", () => {
    for (const seed of [-1, 2 ** 32, 1.5, "1", null]) {
      const v = valid();
      v[2] = seed;
      expect(errorOf(decodeDesign(packJson(v))), String(seed)).toBe("invalid-seed");
    }
    for (const [w, h] of [
      [0, 100],
      [100, 8193],
      [15, 100],
      [100.5, 100],
      ["100", 100],
    ]) {
      const v = valid();
      v[3] = w;
      v[4] = h;
      expect(errorOf(decodeDesign(packJson(v))), `${String(w)}x${String(h)}`).toBe("invalid-size");
    }
  });
});

describe("fuzzing", () => {
  const rng = createRng(2026);
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  it("never throws or accepts random base64url strings", () => {
    for (let i = 0; i < 2000; i++) {
      const len = rng.int(0, 300);
      let s = "";
      for (let k = 0; k < len; k++) s += ALPHABET[rng.int(0, ALPHABET.length - 1)];
      const r = decodeDesign(s);
      expect(r.ok, s).toBe(false);
    }
  });

  it("never throws on random bytes behind a valid version byte", () => {
    for (let i = 0; i < 1000; i++) {
      const bytes = new Uint8Array(rng.int(0, 200));
      for (let k = 0; k < bytes.length; k++) bytes[k] = rng.int(0, 255);
      expect(() => decodeDesign(packRaw(bytes))).not.toThrow();
    }
  });

  it("never throws on random unicode strings", () => {
    for (let i = 0; i < 500; i++) {
      let s = "";
      const len = rng.int(0, 100);
      for (let k = 0; k < len; k++) s += String.fromCharCode(rng.int(0, 0xffff));
      expect(decodeDesign(s).ok).toBe(false);
    }
  });

  it("rejects or validates every bit flip and truncation of a valid code", () => {
    const code = encodeOk(design(cssGradientTool, { seed: 77 }));
    const check = (s: string): void => {
      const r = decodeDesign(s);
      // Mutations may still decode, but then only to a fully valid design.
      if (r.ok) expect(cssGradientTool.schema.safeParse(r.design.params).success).toBe(true);
    };
    for (let i = 0; i < code.length; i++) {
      for (const c of ["A", "z", "-", "_", "9"]) check(code.slice(0, i) + c + code.slice(i + 1));
      check(code.slice(0, i));
    }
  });
});

describe("hash helpers", () => {
  const d = design(cssGradientTool, { seed: 5 });

  it("round-trips through #d=", () => {
    const hash = designToHash(d);
    expect(hash.ok && hash.value).toMatch(/^#d=[A-Za-z0-9_-]+$/);
    if (!hash.ok) return;
    expect(designFromHash(hash.value)).toMatchObject({ ok: true, design: d });
    expect(designFromHash(hash.value.slice(1))).toMatchObject({ ok: true });
    expect(designFromHash(`#utm=x&${hash.value.slice(1)}&y=1`)).toMatchObject({ ok: true });
  });

  it("reports missing and oversized hashes", () => {
    expect(designFromHash("")).toEqual({ ok: false, error: "empty" });
    expect(designFromHash("#other=1")).toEqual({ ok: false, error: "empty" });
    expect(designFromHash("#d=")).toEqual({ ok: false, error: "empty" });
    expect(designFromHash(`#d=${"A".repeat(20_000)}`)).toEqual({ ok: false, error: "too-long" });
    expect(designFromHash("#d=%%%")).toEqual({ ok: false, error: "malformed" });
  });

  it("feeds the editor store", () => {
    const store = createEditorStore({ toolId: "blob" });
    const hash = designToHash(d);
    if (!hash.ok) throw new Error(hash.error);
    const r = designFromHash(hash.value);
    if (!r.ok) throw new Error(r.error);
    expect(store.getState().loadDesign(r.design)).toEqual({ ok: true });
    expect(selectDesign(store.getState())).toEqual(d);
  });
});

describe("image-derived params", () => {
  const tool = paletteFromImageTool;
  const userColors = [{ color: "#123456", share: 1 }];

  it("are left out when encoding, so nothing from the user's image is in the link", () => {
    const code = encodeOk(
      design(tool, { params: { ...tool.defaults, count: 7, colors: userColors } }),
    );
    const json = new TextDecoder().decode(inflateSync(base64urlDecode(code).subarray(1)));
    expect(json).not.toContain("#123456");
    expect(decodeDesign(code)).toMatchObject({
      ok: true,
      design: { params: { ...tool.defaults, count: 7 } },
    });
  });

  it("are reset when decoding a crafted link that carries them", () => {
    const params = { ...tool.defaults, colors: userColors };
    const code = packJson([tool.id, tool.version, 1, 1920, 1080, params]);
    expect(decodeDesign(code)).toMatchObject({ ok: true, design: { params: tool.defaults } });
  });
});

describe("CSS pattern layers", () => {
  const tool = cssPatternsTool;
  const ids = tool.schema.shape.layers.element.shape.pattern.options;

  /** The largest design the schema allows: five distinct layers, long numbers everywhere. */
  function maxDesign(): Design {
    const layers = Array.from({ length: 5 }, (_, i) => ({
      pattern: ids[(i * 7) % ids.length] as (typeof ids)[number],
      color: `#${(0x123456 + i * 0x111111).toString(16).slice(-6)}`,
      accent: `#${(0xfedcba - i * 0x101010).toString(16).slice(-6)}`,
      size: 200 - i * 2,
      angle: 359.99999999999994 - i / 3,
      opacity: 99.99999999999999 - i / 7,
      visible: i % 2 === 0,
    }));
    return design(tool, {
      params: { background: "#abcdef", layers },
      seed: 0xffffffff,
      size: { width: 8192, height: 8192 },
    });
  }

  it("fits a five-layer design with maximal values into the codec limits", () => {
    const d = maxDesign();
    expect(tool.schema.safeParse(d.params).success).toBe(true);
    const code = encodeOk(d);
    expect(code.length).toBeLessThan(SHARE_MAX_ENCODED_LENGTH / 4);
    expect(decodeDesign(code)).toEqual({
      ok: true,
      design: d,
      toolVersion: tool.version,
      outdated: false,
    });
  });

  it("rejects a sixth layer and broken layers", () => {
    const d = maxDesign();
    const layers = d.params.layers as Record<string, unknown>[];
    const first = layers[0] as Record<string, unknown>;
    for (const params of [
      { ...d.params, layers: [...layers, first] },
      { ...d.params, layers: [] },
      { ...d.params, layers: [{ ...first, color: "red" }] },
      { ...d.params, layers: [{ ...first, pattern: "polka;}" }] },
      { ...d.params, layers: "polka" },
    ]) {
      const code = packJson([tool.id, tool.version, 1, 1080, 1080, params]);
      expect(errorOf(decodeDesign(code))).toBe("invalid-params");
    }
  });

  it("opens old single-pattern links as a stack of one", () => {
    const old = {
      background: "#fffaf5",
      pattern: "gingham",
      color: "#d62839",
      accent: "#e07a5f",
      size: 28,
      angle: 0,
      opacity: 90,
    };
    const code = packJson([tool.id, 1, 1, 1080, 1080, old]);
    const r = decodeDesign(code);
    expect(r).toMatchObject({
      ok: true,
      design: {
        params: {
          background: "#fffaf5",
          layers: [
            {
              pattern: "gingham",
              color: "#d62839",
              accent: "#e07a5f",
              size: 28,
              angle: 0,
              opacity: 90,
              visible: true,
            },
          ],
        },
      },
    });
    const bad = packJson([tool.id, 1, 1, 1080, 1080, { ...old, color: "#fff;x" }]);
    expect(errorOf(decodeDesign(bad))).toBe("invalid-params");
  });
});

describe("share links: uploads never travel (security review M3-AP12)", () => {
  const tool = seamlessPatternsTool;
  const svgUpload = {
    kind: "svg",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
    width: 10,
    height: 10,
    name: "x.svg",
  };
  const rasterUpload = {
    kind: "raster",
    href: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    width: 1,
    height: 1,
    name: "x.png",
  };

  it("drops an upload injected into a crafted link", () => {
    for (const upload of [svgUpload, rasterUpload]) {
      const code = packJson([tool.id, tool.version, 1, 1080, 1080, { ...tool.defaults, upload }]);
      const r = decodeDesign(code);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.design.params.upload).toBeNull();
    }
  });

  it("ignores an upload in a link even when it does not match the schema", () => {
    // M4-AP09: local params are reset before validation, so a planted value is
    // never validated or kept, and cannot make an otherwise valid link fail.
    const bad = {
      ...tool.defaults,
      upload: { kind: "svg", svg: "", width: -1, height: 0, name: 1 },
    };
    const r = decodeDesign(packJson([tool.id, tool.version, 1, 1080, 1080, bad]));
    expect(r.ok && r.design.params).toEqual(tool.defaults);
  });

  it("never encodes the upload into a link", () => {
    const code = encodeOk(design(tool, { params: { ...tool.defaults, upload: rasterUpload } }));
    const json = new TextDecoder().decode(inflateSync(base64urlDecode(code).subarray(1)));
    expect(json).not.toContain("data:image");
    expect(json).not.toContain("x.png");
  });
});
