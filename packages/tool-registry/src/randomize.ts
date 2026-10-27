/**
 * Returns `next` with every locked key copied back from `current`. Use it at
 * the end of `randomize` so lock handling is identical across tools.
 */
export function keepLocked<P extends object>(
  next: P,
  current: P,
  locks: ReadonlySet<keyof P & string>,
): P {
  if (locks.size === 0) return next;
  const out = { ...next };
  for (const key of locks) out[key] = current[key];
  return out;
}
