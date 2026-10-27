"use client";

import { useTranslations } from "next-intl";

/** Translator for keys that are only known at runtime (tool params, options). */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Root translator without compile-time key checking. The editor builds keys
 * from tool ids and param names, which the app's typed `Messages` cannot
 * know; key coverage is checked by tests instead.
 */
export function useT(): Translate {
  // The cast drops next-intl's literal key types, see above.
  return useTranslations() as unknown as Translate;
}
