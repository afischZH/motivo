/**
 * Konva for the social editor, loaded on demand: only the core plus the
 * shapes the editor draws (rectangle, ellipse, line, text, image and the
 * transformer); shapes of the library are a custom shape with a native
 * `Path2D`, so `konva/lib/shapes/Path` (path parsing) stays out. Measured
 * with esbuild (minified, gzip -9): about 45.8 KB. Never imported
 * statically, so no other page loads it (checked by
 * `lib/social-editor/bundle.test.ts`).
 */
export type KonvaCore = typeof import("konva/lib/Core").default;

export interface KonvaKit {
  Konva: KonvaCore;
  Rect: typeof import("konva/lib/shapes/Rect").Rect;
  Ellipse: typeof import("konva/lib/shapes/Ellipse").Ellipse;
  Line: typeof import("konva/lib/shapes/Line").Line;
  Text: typeof import("konva/lib/shapes/Text").Text;
  Image: typeof import("konva/lib/shapes/Image").Image;
  Transformer: typeof import("konva/lib/shapes/Transformer").Transformer;
}

let loading: Promise<KonvaKit> | null = null;

export function loadKonva(): Promise<KonvaKit> {
  // Browser only: the guard keeps Konva out of the server bundle (Worker size).
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  loading ??= Promise.all([
    import("konva/lib/Core"),
    import("konva/lib/shapes/Rect"),
    import("konva/lib/shapes/Ellipse"),
    import("konva/lib/shapes/Line"),
    import("konva/lib/shapes/Text"),
    import("konva/lib/shapes/Image"),
    import("konva/lib/shapes/Transformer"),
  ]).then(([core, rect, ellipse, line, text, image, transformer]) => {
    const Konva = core.default;
    // Crisp output at any zoom; the export sets its own pixel ratio.
    Konva.pixelRatio =
      typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
    return {
      Konva,
      Rect: rect.Rect,
      Ellipse: ellipse.Ellipse,
      Line: line.Line,
      Text: text.Text,
      Image: image.Image,
      Transformer: transformer.Transformer,
    };
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
