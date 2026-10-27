"use client";

/**
 * Editor state of the image input: which picture is active (the tool's
 * built-in sample or the user's image), its downsampled pixels, loading and
 * error state, and the derive loop that keeps the derived params in sync with
 * (image, seed, `deriveOn` params). Tool-agnostic: everything comes from
 * `tool.imageInput`. Nothing is persisted; the pixels live only in memory.
 *
 * The logic is a small framework-free controller (unit-testable without
 * React); `useImageInput` binds it to a component.
 */
import type { AnyToolDefinition, PixelBuffer } from "@motivo/tool-registry";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { EditorState, EditorStoreApi } from "../store/editor-store";
import type { ImageInputError } from "./check";
import type { ImageDecodeResult, ImageDeriveResult, ImageInputServices } from "./services";

export type ImageSource = { kind: "sample" } | { kind: "user"; name: string };

export interface ImageInputView {
  source: ImageSource;
  /** Pixels of the active picture; `null` until the controller starts (client only). */
  pixels: PixelBuffer | null;
  /** `loading`: reading and decoding a file; `analysing`: running `derive`. */
  status: "idle" | "loading" | "analysing";
  error: ImageInputError | null;
  /** Increases when a user image was loaded and analysed (for announcements). */
  loadedCount: number;
}

export interface ImageInputActions {
  loadFile(file: Blob & { name?: string }): void;
  resetToSample(): void;
  dismissError(): void;
}

export type ImageInputControls = ImageInputView & ImageInputActions;

export interface ImageInputController extends ImageInputActions {
  /** Shows the sample and starts following the store. Returns `stop`. */
  start(): () => void;
  getView(): ImageInputView;
  subscribe(listener: () => void): () => void;
}

const INITIAL_VIEW: ImageInputView = {
  source: { kind: "sample" },
  pixels: null,
  status: "idle",
  error: null,
  loadedCount: 0,
};

/** What `derive` depends on besides the pixels. */
function deriveKey(tool: AnyToolDefinition, s: EditorState): string {
  const keys = tool.imageInput?.deriveOn ?? [];
  return JSON.stringify([s.seed, ...keys.map((k) => s.params[k])]);
}

export function createImageInputController(
  store: EditorStoreApi,
  tool: AnyToolDefinition,
  services: ImageInputServices,
): ImageInputController {
  const input = tool.imageInput;
  const listeners = new Set<() => void>();
  let view = INITIAL_VIEW;
  /** Bumped by start/stop, so replies from an earlier run are ignored. */
  let generation = 0;
  let running = false;
  /** One derive at a time; changes while it runs queue exactly one more. */
  let busy = false;
  let queued = false;
  /** Announce the next successful derive (a user image just loaded). */
  let announce = false;

  const update = (patch: Partial<ImageInputView>) => {
    view = { ...view, ...patch };
    for (const listener of listeners) listener();
  };

  const runDerive = (): void => {
    const pixels = view.pixels;
    if (!input || !running || !pixels) return;
    if (busy) {
      queued = true;
      return;
    }
    busy = true;
    const gen = generation;
    const state = store.getState();
    const key = deriveKey(tool, state);
    if (view.status !== "loading") update({ status: "analysing" });
    void services
      .derive(tool, pixels, state.params, state.seed)
      // A throwing derive must not leave `busy` set forever (no further derives).
      .catch((): ImageDeriveResult => ({ ok: false, error: "no-result" }))
      .then((result) => {
        if (gen !== generation) return;
        busy = false;
        const current = store.getState();
        const stale = view.pixels !== pixels || deriveKey(tool, current) !== key;
        if (stale || queued) {
          queued = false;
          runDerive();
          return;
        }
        if (result.ok) current.applyDerived(result.patch);
        const announced = announce && result.ok;
        announce = false;
        update({
          status: "idle",
          // The sample always has a result; errors only concern the user's image.
          error: result.ok || view.source.kind === "sample" ? view.error : result.error,
          loadedCount: announced ? view.loadedCount + 1 : view.loadedCount,
        });
      });
  };

  const activate = (pixels: PixelBuffer, source: ImageSource) => {
    update({ pixels, source, status: "idle", error: null });
    runDerive();
  };

  return {
    start() {
      if (!input) return () => undefined;
      running = true;
      generation++;
      busy = false;
      queued = false;
      // The sample is the starting picture. Re-deriving syncs the derived
      // params with it (a share link may bring another seed or count).
      activate(input.sample(), { kind: "sample" });
      const unsubscribe = store.subscribe((s, prev) => {
        if (deriveKey(tool, s) !== deriveKey(tool, prev)) runDerive();
      });
      return () => {
        running = false;
        generation++;
        unsubscribe();
        services.dispose();
      };
    },

    getView: () => view,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    loadFile(file) {
      if (!input || !running) return;
      const gen = generation;
      update({ status: "loading", error: null });
      void services
        .decode(file, input.maxEdge)
        // A rejected decode must not leave the view in "loading".
        .catch((): ImageDecodeResult => ({ ok: false, error: "decode-failed" }))
        .then((result) => {
          if (gen !== generation) return;
          if (!result.ok) {
            update({ status: "idle", error: result.error });
            return;
          }
          announce = true;
          activate(result.pixels, { kind: "user", name: file.name ?? "" });
        });
    },

    resetToSample() {
      if (input && running) activate(input.sample(), { kind: "sample" });
    },

    dismissError() {
      update({ error: null });
    },
  };
}

/** Binds an image-input controller to the component's lifetime. */
export function useImageInput(
  store: EditorStoreApi,
  tool: AnyToolDefinition,
  services: ImageInputServices,
): ImageInputControls {
  const controller = useMemo(
    () => createImageInputController(store, tool, services),
    [store, tool, services],
  );
  useEffect(() => controller.start(), [controller]);
  const view = useSyncExternalStore(controller.subscribe, controller.getView, () => INITIAL_VIEW);
  return {
    ...view,
    loadFile: controller.loadFile,
    resetToSample: controller.resetToSample,
    dismissError: controller.dismissError,
  };
}
