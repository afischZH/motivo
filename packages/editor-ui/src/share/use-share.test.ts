import { createRegistry } from "@motivo/tool-registry";
import { describe, expect, it } from "vitest";
import { createEditorStore } from "../store/editor-store";
import { createFixtureRegistry, fixtureDefaults, fixtureTool } from "../test/fixture-tool";
import { designToHash, encodeDesign } from "./share-codec";
import { applyShareHash, buildShareUrl } from "./use-share";

const fixtures = createFixtureRegistry();

function store(toolId = "test-fixture") {
  return createEditorStore({ toolId, registry: createFixtureRegistry() });
}

const shared = {
  toolId: "test-fixture",
  params: { ...fixtureDefaults, count: 42, shape: "square" as const },
  seed: 1234,
  size: { width: 1920, height: 1080 },
};

function hashOf(design: typeof shared, registry = fixtures): string {
  const r = designToHash(design, registry);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("applyShareHash", () => {
  it("loads a valid design and says nothing", () => {
    const s = store();
    expect(applyShareHash(s, hashOf(shared))).toBeNull();
    const state = s.getState();
    expect(state.params).toEqual(shared.params);
    expect(state.seed).toBe(1234);
    expect(state.size).toEqual({ width: 1920, height: 1080 });
  });

  it("ignores pages without #d=", () => {
    const s = store();
    const before = s.getState().params;
    expect(applyShareHash(s, "")).toBeNull();
    expect(applyShareHash(s, "#section")).toBeNull();
    expect(s.getState().params).toBe(before);
  });

  it("keeps the defaults and reports broken links", () => {
    const s = store();
    const before = s.getState().params;
    expect(applyShareHash(s, "#d=!!!")).toEqual({ tone: "error", key: "malformed" });
    expect(applyShareHash(s, "#d=AQ")).toEqual({ tone: "error", key: "malformed" });
    expect(applyShareHash(s, `#d=${"A".repeat(9000)}`)).toEqual({
      tone: "error",
      key: "too-long",
    });
    expect(s.getState().params).toBe(before);
  });

  it("reports tools that neither the page nor the app registry knows", () => {
    const s = store();
    const valid = designToHash(
      {
        toolId: "test-other",
        params: { background: "transparent", palette: ["#000000", "#ffffff"], size: 3 },
        seed: 1,
        size: { width: 100, height: 100 },
      },
      fixtures,
    );
    if (!valid.ok) throw new Error(valid.error);
    expect(applyShareHash(s, valid.value)).toEqual({ tone: "error", key: "unknown-tool" });
    expect(s.getState().toolId).toBe("test-fixture");
  });

  it("reports a known tool of another page as other-tool", () => {
    const s = store();
    const blob = createEditorStore({ toolId: "blob" });
    const link = buildShareUrl(blob, "https://motivo.test/de/tools/blob");
    if (!link.ok) throw new Error(link.error);
    expect(applyShareHash(s, link.url.slice(link.url.indexOf("#")))).toEqual({
      tone: "error",
      key: "other-tool",
    });
    expect(s.getState().toolId).toBe("test-fixture");
  });

  it("loads links of an older tool version with a soft notice", () => {
    const newer = createRegistry();
    newer.register({ ...fixtureTool, version: 2 });
    const code = encodeDesign(shared, newer);
    if (!code.ok) throw new Error(code.error);
    const s = store();
    expect(applyShareHash(s, `#d=${code.value}`)).toEqual({ tone: "info", key: "outdated" });
    expect(s.getState().params).toEqual(shared.params);
  });
});

describe("buildShareUrl", () => {
  it("appends #d=<code> to the page URL and replaces an old hash", () => {
    const s = store();
    s.getState().loadDesign(shared);
    const r = buildShareUrl(s, "https://motivo.test/de/tools/test-fixture?x=1#d=old");
    if (!r.ok) throw new Error(r.error);
    expect(r.url.startsWith("https://motivo.test/de/tools/test-fixture?x=1#d=")).toBe(true);
    expect(r.url).not.toContain("old");

    const t = store();
    expect(applyShareHash(t, r.url.slice(r.url.indexOf("#")))).toBeNull();
    expect(t.getState().params).toEqual(shared.params);
    expect(t.getState().seed).toBe(shared.seed);
  });
});
