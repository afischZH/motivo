/**
 * Thumbnails of the template picker, made in the browser with the export
 * path (`exportScene`: the background's SVG made in the SVG render worker
 * and rasterised by the browser, the layers
 * with `drawScene` at a small scale, encoded asynchronously). They are
 * made one at a time, in the order the picker asks for them (visible cards
 * first), with a pause between two so the page stays responsive, and kept
 * for the session (object URLs of small WebP files, a few KB each). Nothing
 * is precomputed into the bundle or the Worker.
 */

/** Longest edge of a thumbnail in pixels (about two times the card on a 1x screen). */
export const THUMBNAIL_EDGE = 360;

const cache = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

/** A pause that lets the browser handle input and paint between two thumbnails. */
const pause = () => new Promise<void>((resolve) => window.setTimeout(resolve, 16));

/** Ends the current task, so the browser can handle input before the next step. */
export const yieldToBrowser = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

/**
 * The thumbnail URL for `key` (template and language), made by `make` the
 * first time it is asked for. `null` if it could not be made.
 */
export function templateThumbnail(
  key: string,
  make: () => Promise<Blob | null>,
): Promise<string | null> {
  let pending = cache.get(key);
  if (!pending) {
    pending = queue
      .then(make)
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null);
    queue = pending.then(pause);
    cache.set(key, pending);
  }
  return pending;
}
