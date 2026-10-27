/**
 * Wall-clock timing for performance guards in tests only (never imported by
 * product code, which stays deterministic).
 *
 * Shared CI runners are several times slower than a laptop and noisy (GC,
 * neighbours), so a tight budget fails at random. Guards therefore take the
 * fastest of a few runs after a warm-up and compare it with a generous budget:
 * an order of magnitude above a local run, still far below the seconds an
 * unguarded generator took on crafted params. The element caps asserted next
 * to each guard are the exact check; the time budget only catches blow-ups.
 */

/** Budget for one generator run on extreme params (locally 5 to 60 ms). */
export const GENERATOR_BUDGET_MS = 1000;

const clock = (globalThis as unknown as { performance: { now(): number } }).performance;

/** Runs `fn` once to warm up, then `runs` times; returns the fastest run in ms and its result. */
export function fastest<T>(fn: () => T, runs = 3): { ms: number; value: T } {
  let best = Infinity;
  let value = fn();
  for (let i = 0; i < runs; i++) {
    const start = clock.now();
    value = fn();
    best = Math.min(best, clock.now() - start);
  }
  return { ms: best, value };
}
