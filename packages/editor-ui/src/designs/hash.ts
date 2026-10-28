/**
 * `#design=<id>` opens a saved design in the editor. A hash, not a query:
 * it never reaches a server, and the static editor page stays the same.
 */

/** Hash parameter that opens a saved design. */
export const DESIGN_HASH_PARAM = "design";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The `design=<id>` value of a URL hash, if any and well-formed. */
export function designIdFromHash(hash: string): string | null {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  const prefix = `${DESIGN_HASH_PARAM}=`;
  const part = body.split("&").find((p) => p.startsWith(prefix));
  if (part === undefined) return null;
  let id: string;
  try {
    id = decodeURIComponent(part.slice(prefix.length));
  } catch {
    return null;
  }
  return ID.test(id) ? id : null;
}

/** `#design=<id>` for a link to the editor. */
export function designHash(id: string): string {
  return `#${DESIGN_HASH_PARAM}=${encodeURIComponent(id)}`;
}
