"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { browserImageInputServices, type ImageInputServices } from "../image-input/services";
import { browserSvgSanitizer, type SvgSanitizer } from "./sanitize-client";

/**
 * Image services for upload fields (`kind: "image"` params). The editor
 * shell provides its injected services (tests); otherwise a field starts the
 * browser services lazily on its first upload and stops them on unmount.
 */
export const AssetServicesContext = createContext<ImageInputServices | undefined>(undefined);

/** SVG sanitizer for upload fields; injectable like the image services. */
export const SvgSanitizerContext = createContext<SvgSanitizer | undefined>(undefined);

/** A lazily created service that is disposed when the component unmounts. */
function useOwned<T extends { dispose(): void }>(
  provided: T | undefined,
  create: () => T,
): () => T {
  const own = useRef<T | null>(null);
  useEffect(
    () => () => {
      own.current?.dispose();
      own.current = null;
    },
    [],
  );
  return () => {
    if (provided) return provided;
    own.current ??= create();
    return own.current;
  };
}

export function useAssetServices(): () => ImageInputServices {
  return useOwned(useContext(AssetServicesContext), browserImageInputServices);
}

export function useSvgSanitizer(): () => SvgSanitizer {
  return useOwned(useContext(SvgSanitizerContext), browserSvgSanitizer);
}
