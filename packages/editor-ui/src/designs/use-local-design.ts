"use client";

import type { DesignStore } from "@musterli/storage";
import { useEffect, useState, useSyncExternalStore } from "react";
import { peekMotif } from "../shell/render";
import type { EditorStoreApi } from "../store/editor-store";
import {
  createLocalDesignController,
  designIdFromHash,
  type LocalDesignController,
  type LocalDesignView,
  type LocationLike,
} from "./local-design";
import { createDesignThumbnail } from "./thumbnail";

const browserLocation: LocationLike = {
  getHash: () => window.location.hash,
  replaceHash(hash) {
    const { pathname, search } = window.location;
    // replaceState fires no hashchange, so the share hook is not triggered.
    window.history.replaceState(window.history.state, "", `${pathname}${search}${hash}`);
  },
};

const SERVER_VIEW: LocalDesignView = {
  ready: false,
  designId: null,
  name: "",
  saving: false,
  dirty: true,
  notice: null,
};

/**
 * Binds saving to the editor: one controller per editor store, started
 * after mount (IndexedDB and the URL hash only exist in the browser).
 * Returns `null` without a design store (tests, embeds).
 */
export function useLocalDesign(
  store: EditorStoreApi,
  designs: DesignStore | undefined,
  defaultName: () => string,
): { controller: LocalDesignController; view: LocalDesignView } | null {
  const [controller] = useState<LocalDesignController | null>(() =>
    designs
      ? createLocalDesignController({
          store,
          designs,
          location: browserLocation,
          defaultName,
          thumbnail: ({ params, seed, size }) => {
            const s = store.getState();
            // The preview rendered exactly this design already: reuse its SVG.
            const shown = peekMotif(s.tool, params, seed, size);
            return createDesignThumbnail(
              s.tool,
              params,
              seed,
              size,
              shown?.kind === "svg" ? { svg: shown.svg } : {},
            );
          },
        })
      : null,
  );
  useEffect(() => {
    controller?.setDefaultName(defaultName);
  }, [controller, defaultName]);

  useEffect(() => {
    if (!controller) return;
    const stop = controller.start();
    const onHashChange = () => {
      const id = designIdFromHash(window.location.hash);
      if (id !== null && id !== controller.getView().designId) void controller.open(id);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") void controller.flushDraft();
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      stop();
    };
  }, [controller]);

  const view = useSyncExternalStore(
    controller ? controller.subscribe : noopSubscribe,
    controller ? controller.getView : () => SERVER_VIEW,
    () => SERVER_VIEW,
  );
  return controller ? { controller, view } : null;
}

const noopSubscribe = () => () => undefined;
