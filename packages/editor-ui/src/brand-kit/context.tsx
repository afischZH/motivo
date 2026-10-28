"use client";

/**
 * The brand kit as the editor sees it (M3-AP06): palettes for "apply brand
 * palette" and the quick swatches of every colour picker, and logos and
 * shapes for upload fields. Read from IndexedDB in the browser; reloaded
 * when the window gets focus again, so changes made on the Brand Kit page
 * in another tab show up without a reload.
 */
import type { BrandAsset, BrandKitStore, BrandPalette, BrandPalettes } from "@motivo/storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export interface BrandKitView {
  /** Oldest first. */
  palettes: readonly BrandPalette[];
  defaultId: string | null;
  /** Logos and shapes (read on demand: images can be large). */
  listAssets(): Promise<BrandAsset[]>;
  /** The Brand Kit page in the current locale, for "create one" links. */
  href?: string;
}

export const BrandKitContext = createContext<BrandKitView | null>(null);

/** The brand kit, or `null` outside an editor that has one (tests, embeds). */
export function useBrandKit(): BrandKitView | null {
  return useContext(BrandKitContext);
}

const EMPTY: BrandPalettes = { palettes: [], defaultId: null };

/** Loads the brand palettes from `store` and keeps them fresh. */
export function useBrandKitView(
  store: BrandKitStore | undefined,
  href: string | undefined,
): BrandKitView | null {
  const [data, setData] = useState<BrandPalettes>(EMPTY);

  useEffect(() => {
    if (!store) return;
    let active = true;
    const load = () => {
      store.loadPalettes().then(
        (next) => {
          if (active) setData(next);
        },
        // No brand kit in this browser (private mode): the editor works without it.
        () => undefined,
      );
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [store]);

  return useMemo(() => {
    if (!store) return null;
    const view: BrandKitView = {
      palettes: data.palettes,
      defaultId: data.defaultId,
      listAssets: () => store.listAssets(),
    };
    if (href !== undefined) view.href = href;
    return view;
  }, [store, href, data]);
}

/** Palettes with the default one first. */
export function orderedPalettes(view: BrandKitView): BrandPalette[] {
  const first = view.palettes.filter((p) => p.id === view.defaultId);
  return [...first, ...view.palettes.filter((p) => p.id !== view.defaultId)];
}

/** Most quick swatches in a colour picker. */
export const BRAND_SWATCHES_MAX = 20;

/** Distinct brand colours, default palette first, at most `BRAND_SWATCHES_MAX`. */
export function brandSwatches(view: BrandKitView | null): string[] {
  if (!view) return [];
  const out: string[] = [];
  for (const palette of orderedPalettes(view)) {
    for (const color of palette.colors) {
      if (!out.includes(color)) out.push(color);
      if (out.length >= BRAND_SWATCHES_MAX) return out;
    }
  }
  return out;
}
