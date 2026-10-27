/**
 * Structural equality for parameter values. Params are JSON-like (numbers,
 * strings, booleans, arrays and plain objects), so a small recursive compare
 * is enough and avoids a dependency.
 */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => valuesEqual(item, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const rb = b as Record<string, unknown>;
  const ra = a as Record<string, unknown>;
  return ka.every(
    (key) => Object.prototype.hasOwnProperty.call(rb, key) && valuesEqual(ra[key], rb[key]),
  );
}
