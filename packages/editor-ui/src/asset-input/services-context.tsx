"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { browserImageInputServices, type ImageInputServices } from "../image-input/services";

/**
 * Image services for upload fields (`kind: "image"` params). The editor
 * shell provides its injected services (tests); otherwise a field starts the
 * browser services lazily on its first upload and stops them on unmount.
 */
export const AssetServicesContext = createContext<ImageInputServices | undefined>(undefined);

export function useAssetServices(): () => ImageInputServices {
  const provided = useContext(AssetServicesContext);
  const own = useRef<ImageInputServices | null>(null);
  useEffect(
    () => () => {
      own.current?.dispose();
      own.current = null;
    },
    [],
  );
  return () => {
    if (provided) return provided;
    own.current ??= browserImageInputServices();
    return own.current;
  };
}
