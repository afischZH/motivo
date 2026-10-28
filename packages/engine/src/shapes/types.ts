/** What a shape builder returns: path data, or a primary layer plus an optional accent layer. */
export type ShapeSource = string | { readonly d: string; readonly accent?: string };

/** Builders of one pack by shape id, in display order. Called once, then cached. */
export type PackBuilders = Readonly<Record<string, () => ShapeSource>>;
