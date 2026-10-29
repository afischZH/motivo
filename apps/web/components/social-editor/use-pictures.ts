"use client";

/**
 * The pictures behind the stage: the background rendered by its tool (in
 * the tool's worker, debounced while sliders move, aborted when a newer
 * version is asked for) and the decoded image and logo layers. Only the
 * parts that change are redone: the background follows its tool, params,
 * seed and the format; pictures are cached per image object.
 */
import type { Scene } from "@musterli/scene";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ScenePictures } from "./konva-scene";
import { decodePicture, renderBackground, type Picture } from "./resources";

const BACKGROUND_DEBOUNCE_MS = 120;

export interface PicturesState extends ScenePictures {
  /** The background is being rendered. */
  rendering: boolean;
  /** The background could not be rendered. */
  failed: boolean;
}

interface Version {
  toolId: string;
  params: Record<string, unknown>;
  seed: number;
  width: number;
  height: number;
}

export function useScenePictures(scene: Scene): PicturesState {
  const background = scene.layers[0]?.kind === "background" ? scene.layers[0] : null;
  const { width, height } = scene.format;
  // The last finished render (bitmap, or `null` when it failed) and what it was for.
  const [done, setDone] = useState<{ version: Version; ok: boolean } | null>(null);
  // The bitmap on the stage: the last good one, kept while a newer one renders.
  const [shown, setShown] = useState<ImageBitmap | null>(null);
  // The bitmap is closed once the editor goes away (it holds the pixels of the whole canvas).
  const shownRef = useRef<ImageBitmap | null>(null);
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);
  useEffect(() => {
    const live = shownRef;
    return () => {
      live.current?.close();
      live.current = null;
    };
  }, []);

  const toolId = background?.toolId;
  const params = background?.params;
  const seed = background?.seed;
  useEffect(() => {
    // Without a background the bitmap is ignored (see below).
    if (!background) return;
    const version: Version = {
      toolId: background.toolId,
      params: background.params,
      seed: background.seed,
      width,
      height,
    };
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      renderBackground(background, { width, height }, { width, height }, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) {
            result?.close();
            return;
          }
          if (result) {
            setShown((previous) => {
              // The stage may still draw the old bitmap until it has the new one.
              if (previous) window.setTimeout(() => previous.close(), 1000);
              return result;
            });
          }
          setDone({ version, ok: result !== null });
        },
        () => {
          if (!controller.signal.aborted) setDone({ version, ok: false });
        },
      );
    }, BACKGROUND_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // The layer object changes with every move of other layers; only these parts matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId, params, seed, width, height]);

  const current =
    done !== null &&
    done.version.toolId === toolId &&
    done.version.params === params &&
    done.version.seed === seed &&
    done.version.width === width &&
    done.version.height === height;
  const rendering = background !== null && !current;
  const failed = background !== null && current && !done.ok;
  const bitmap = shown;

  const pictureLayers = useMemo(
    () => scene.layers.filter((l) => l.kind === "image" || l.kind === "logo"),
    [scene.layers],
  );
  const [images, setImages] = useState<ReadonlyMap<string, Picture>>(() => new Map());
  useEffect(() => {
    let active = true;
    void Promise.all(
      pictureLayers.map(async (layer) => {
        try {
          return [layer.id, await decodePicture(layer.image)] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (!active) return;
      const next = new Map<string, Picture>();
      for (const entry of entries) if (entry) next.set(entry[0], entry[1]);
      setImages((previous) => {
        if (previous.size === next.size && [...next].every(([id, p]) => previous.get(id) === p)) {
          return previous;
        }
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [pictureLayers]);

  const hasBackground = background !== null;
  return useMemo(
    () => ({
      background: hasBackground ? bitmap : null,
      images,
      rendering,
      failed,
    }),
    [hasBackground, bitmap, images, rendering, failed],
  );
}
