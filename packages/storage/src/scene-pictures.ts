/**
 * Picture data of social scenes as Blobs in IndexedDB. Writing a record
 * copies (structured-clones) every string in it on the main thread: a scene
 * with 20 MB of data URIs blocked it for 50 ms and more on every autosave
 * and save. A Blob in a record is only a reference, the browser writes its
 * bytes elsewhere, so a stored scene keeps each large `href` (raster) or
 * `svg` (markup) as a text Blob of the very same string.
 *
 * Turning a string into a Blob still copies it, so it happens in chunks
 * with a yield in between, and only once per picture: the Blob is kept for
 * the string (also for strings read back from a Blob), so the next autosave
 * of the same picture costs nothing. Reading turns the Blobs back into
 * strings before the scene is validated as before; nothing outside this
 * package ever sees a Blob in a scene.
 */
import type { Scene } from "@musterli/scene";

/** Picture data from this length on is stored as a Blob; small data stays inline. */
export const PICTURE_BLOB_MIN_LENGTH = 32_768;
/** Characters copied into a Blob per task (about 1 MB, a few milliseconds). */
const CHUNK_LENGTH = 1 << 20;
/** A Blob larger than this is not read back (no picture is anywhere near it). */
const PICTURE_BLOB_MAX_SIZE = 32_000_000;
/** Blobs kept for recent picture strings: more than the pictures of a scene and its draft. */
const CACHE_SIZE = 64;

type PictureField = "href" | "svg";

const cache = new Map<string, Promise<Blob>>();

function remember(text: string, blob: Promise<Blob>): void {
  cache.delete(text);
  cache.set(text, blob);
  while (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function chunkedBlob(text: string): Promise<Blob> {
  const parts: Blob[] = [];
  for (let i = 0; i < text.length; i += CHUNK_LENGTH) {
    if (i > 0) await yieldTask();
    parts.push(new Blob([text.slice(i, i + CHUNK_LENGTH)]));
  }
  return new Blob(parts, { type: "text/plain" });
}

/** The Blob for a picture string, made once and then reused. */
export function pictureBlob(text: string): Promise<Blob> {
  const known = cache.get(text);
  if (known) {
    remember(text, known);
    return known;
  }
  const made = chunkedBlob(text);
  remember(text, made);
  made.catch(() => cache.delete(text));
  return made;
}

function pictureField(image: { kind?: unknown }): PictureField | null {
  if (image.kind === "raster") return "href";
  if (image.kind === "svg") return "svg";
  return null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The scene as stored: large picture data as Blobs, everything else as is
 * (the same objects, no deep copy). Call it before the write transaction.
 */
export async function packScene(scene: Scene): Promise<unknown> {
  const layers: unknown[] = [];
  // One picture after the other, so each task copies at most one chunk.
  for (const layer of scene.layers) {
    if (layer.kind !== "image" && layer.kind !== "logo") {
      layers.push(layer);
      continue;
    }
    const image = layer.image;
    const text = image.kind === "raster" ? image.href : image.svg;
    if (text.length < PICTURE_BLOB_MIN_LENGTH) {
      layers.push(layer);
      continue;
    }
    const field: PictureField = image.kind === "raster" ? "href" : "svg";
    layers.push({ ...layer, image: { ...image, [field]: await pictureBlob(text) } });
  }
  return { ...scene, layers };
}

/**
 * A stored scene with its picture Blobs read back into strings, ready for
 * the usual validation. Anything that does not look like a packed picture
 * is passed on unchanged (and fails validation there if it is broken).
 */
export async function unpackScene(value: unknown): Promise<unknown> {
  if (!isRecord(value) || !Array.isArray(value.layers)) return value;
  let packed = false;
  const layers = await Promise.all(
    value.layers.map(async (layer: unknown) => {
      if (!isRecord(layer) || !isRecord(layer.image)) return layer;
      const field = pictureField(layer.image);
      const blob = field ? layer.image[field] : undefined;
      if (!field || !(blob instanceof Blob)) return layer;
      packed = true;
      if (blob.size > PICTURE_BLOB_MAX_SIZE)
        return { ...layer, image: { ...layer.image, [field]: null } };
      const text = await blob.text();
      remember(text, Promise.resolve(blob));
      return { ...layer, image: { ...layer.image, [field]: text } };
    }),
  );
  return packed ? { ...value, layers } : value;
}

/** Test hook: forgets all Blobs made so far. */
export function clearPictureBlobs(): void {
  cache.clear();
}
