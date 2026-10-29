/** Pure helpers of the command palette (tested in `search.test.ts`). */

/** ⌘K on macOS, Ctrl+K elsewhere; ⌘/Ctrl+Shift+K stays the theme switch. */
export function isPaletteShortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "k"
  );
}

/** Search words in lower case without accents, so "verlaufe" finds "Verläufe". */
export function normalizeSearch(text: string): string[] {
  return normalize(text).split(/\s+/).filter(Boolean);
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Entries matching every word (in the label or the terms), best first: a
 * label starting with the first word, then a label containing it, then the
 * rest. Stable within a rank, so groups keep their order.
 */
export function rankEntries<T>(
  entries: readonly T[],
  text: (entry: T) => { label: string; terms: string },
  words: readonly string[],
): T[] {
  const first = words[0] ?? "";
  const scored: { entry: T; score: number; index: number }[] = [];
  entries.forEach((entry, index) => {
    const { label, terms } = text(entry);
    const l = normalize(label);
    const all = `${l} ${normalize(terms)}`;
    if (!words.every((w) => all.includes(w))) return;
    const score = l.startsWith(first) ? 0 : l.includes(first) ? 1 : 2;
    scored.push({ entry, score, index });
  });
  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  return scored.map((s) => s.entry);
}
