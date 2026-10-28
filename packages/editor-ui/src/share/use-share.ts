"use client";

/**
 * Share links in the editor (M1-AP06 UI): build `<page url>#d=<code>` on
 * demand, and load a design from the URL hash on page load and on
 * `hashchange`. The hash is never written while editing.
 */
import { registry as defaultRegistry, type AnyToolDefinition } from "@musterli/tool-registry";
import { useEffect, useState } from "react";
import { selectDesign, type EditorStoreApi } from "../store/editor-store";
import { designFromHash, designToHash, type ShareEncodeError } from "./share-codec";

/** A notice shown under the editor header. `key` is under `Editor.share.notices`. */
export type ShareNotice = { tone: "error" | "info"; key: string };

/** Looks up the current tool first (tests and custom registries), then the app registry. */
function lookupFor(tool: AnyToolDefinition) {
  return {
    get: (id: string): AnyToolDefinition | undefined =>
      id === tool.id ? tool : defaultRegistry.get(id),
  };
}

/**
 * Loads the design in `hash` into the store. Returns the notice to show,
 * or `null` when there is nothing to say (no `#d=` or a clean load). On any
 * failure the store keeps its current design.
 */
export function applyShareHash(store: EditorStoreApi, hash: string): ShareNotice | null {
  const state = store.getState();
  const result = designFromHash(hash, lookupFor(state.tool));
  if (!result.ok) {
    return result.error === "empty" ? null : { tone: "error", key: result.error };
  }
  if (result.design.toolId !== state.toolId) return { tone: "error", key: "other-tool" };
  const loaded = state.loadDesign(result.design);
  if (!loaded.ok) return { tone: "error", key: "invalid-params" };
  return result.outdated ? { tone: "info", key: "outdated" } : null;
}

/** Absolute share URL for the current design: the page URL without its hash plus `#d=<code>`. */
export function buildShareUrl(
  store: EditorStoreApi,
  pageUrl: string,
): { ok: true; url: string } | { ok: false; error: ShareEncodeError } {
  const state = store.getState();
  const hash = designToHash(selectDesign(state), lookupFor(state.tool));
  if (!hash.ok) return hash;
  const base = pageUrl.split("#", 1)[0] ?? pageUrl;
  return { ok: true, url: `${base}${hash.value}` };
}

/**
 * Applies `location.hash` once after mount and again on every `hashchange`.
 * Returns the current notice and a function to dismiss it.
 */
export function useShareHash(store: EditorStoreApi): [ShareNotice | null, () => void] {
  const [notice, setNotice] = useState<ShareNotice | null>(null);

  useEffect(() => {
    const apply = () => setNotice(applyShareHash(store, window.location.hash));
    // The server rendered the defaults; the hash only exists in the browser.
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [store]);

  return [notice, () => setNotice(null)];
}
