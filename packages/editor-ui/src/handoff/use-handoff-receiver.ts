"use client";

/**
 * The target end of "Weiterverwenden in" (docs/ARCHITECTURE.md 4.18). On
 * mount, a `#handoff=<token>` in the URL takes the picture from the tab's
 * hand-over store (once) and removes the hash. As soon as the editor is
 * ready (a restored draft would otherwise overwrite it), the picture runs
 * through the target field's upload checks and goes into its param as one
 * undo step (`setParam` plus `commit`, like an upload; a photo also sets
 * the design size). For the image picker of an `imageInput` tool the
 * picture is handed to that picker instead.
 */
import { findImageTarget } from "@musterli/tool-registry";
import { useEffect, useRef, useState } from "react";
import { useAssetServices, useSvgSanitizer } from "../asset-input/services-context";
import type { AssetError } from "../asset-input/prepare";
import { resolveControl, type ImageControl } from "../controls/resolve";
import type { ImageInputServices } from "../image-input/services";
import type { EditorStoreApi } from "../store/editor-store";
import { prepareHandoffAsset } from "./picture";
import { handoffStore, handoffTokenFromHash, type HandoffEntry, type HandoffStore } from "./store";

/** What happened to a hand-over, for the shell to announce. */
export type HandoffOutcome =
  | { kind: "applied"; sourceToolId: string }
  | { kind: "analysing"; sourceToolId: string }
  | { kind: "expired" }
  | { kind: "rejected"; error: AssetError };

/** A picture for the image picker of an `imageInput` tool. */
export interface IncomingImage {
  id: number;
  file: Blob & { name: string };
}

export interface HandoffReceiverOptions {
  store: EditorStoreApi;
  /** False while a saved design or draft may still load. */
  ready: boolean;
  onOutcome(outcome: HandoffOutcome): void;
  /** Image services of the editor (tests); default: the browser services, started on use. */
  services?: ImageInputServices | undefined;
  /** Injectable for tests. */
  handoffs?: HandoffStore;
  location?: { getHash(): string; replaceHash(hash: string): void };
}

const browserLocation = {
  getHash: () => window.location.hash,
  replaceHash: (hash: string) => {
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    window.history.replaceState(window.history.state, "", url);
  },
};

/** The hash without the `handoff=` part (other parts stay). */
export function hashWithoutHandoff(hash: string): string {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  const rest = body.split("&").filter((p) => p !== "" && !p.startsWith("handoff="));
  return rest.length > 0 ? `#${rest.join("&")}` : "";
}

/** The image control of a target param, or `null` when it is no image field. */
function imageControlOf(store: EditorStoreApi, param: string): ImageControl | null {
  const { tool } = store.getState();
  if (findImageTarget(tool, param)?.kind !== "param") return null;
  const hints = tool.controls?.params as Record<string, object | undefined> | undefined;
  const control = resolveControl(tool, param, hints?.[param] ?? {});
  return control?.kind === "image" ? control : null;
}

/** Returns the picture for an `imageInput` picker, if the hand-over is for one. */
export function useHandoffReceiver(options: HandoffReceiverOptions): IncomingImage | null {
  const { store, ready } = options;
  const getOwnServices = useAssetServices();
  const getSanitizer = useSvgSanitizer();
  const [incoming, setIncoming] = useState<IncomingImage | null>(null);
  // Kept across StrictMode's double effects: the token is taken once.
  const taken = useRef<{ entry: HandoffEntry | null; done: boolean } | null>(null);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    if (taken.current) return;
    const location = latest.current.location ?? browserLocation;
    const hash = location.getHash();
    const token = handoffTokenFromHash(hash);
    if (token === null) {
      taken.current = { entry: null, done: true };
      return;
    }
    location.replaceHash(hashWithoutHandoff(hash));
    const handoffs = latest.current.handoffs ?? handoffStore;
    const entry = handoffs.take(token, store.getState().toolId);
    taken.current = { entry, done: entry === null };
    if (!entry) latest.current.onOutcome({ kind: "expired" });
  }, [store]);

  useEffect(() => {
    const slot = taken.current;
    if (!ready || !slot || slot.done || !slot.entry) return;
    const entry = slot.entry;
    const report = (outcome: HandoffOutcome) => latest.current.onOutcome(outcome);
    if (entry.param === null) {
      slot.done = true;
      const file = Object.assign(entry.blob.slice(0, entry.blob.size, entry.blob.type), {
        name: entry.name,
      });
      setIncoming({ id: Date.now(), file });
      report({ kind: "analysing", sourceToolId: entry.sourceToolId });
      return;
    }
    const control = imageControlOf(store, entry.param);
    if (!control) {
      slot.done = true;
      report({ kind: "rejected", error: "unsupported-type" });
      return;
    }
    const abort = new AbortController();
    void prepareHandoffAsset(
      entry.blob,
      entry.name,
      control,
      { crop: (latest.current.services ?? getOwnServices()).crop, svg: getSanitizer() },
      abort.signal,
    ).then((result) => {
      if (abort.signal.aborted) return;
      slot.done = true;
      if (!result.ok) {
        if (result.error !== "aborted") report({ kind: "rejected", error: result.error });
        return;
      }
      const state = store.getState();
      state.setParam(control.key, result.asset);
      // Closes the step: the next change is an undo step of its own.
      state.commit();
      report({ kind: "applied", sourceToolId: entry.sourceToolId });
    });
    return () => abort.abort();
    // `getOwnServices` and `getSanitizer` only read refs of owned services.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, store]);

  return incoming;
}
