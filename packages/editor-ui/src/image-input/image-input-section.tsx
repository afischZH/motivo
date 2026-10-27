"use client";

import { useMemo } from "react";
import { useEditorStore, useEditorStoreApi } from "../store/react";
import { ImageInputPanel } from "./image-input-panel";
import { browserImageInputServices, type ImageInputServices } from "./services";
import { useImageInput } from "./use-image-input";

/**
 * The image input of the current tool, bound to the editor store. Renders
 * nothing for tools without `imageInput`.
 */
export function ImageInputSection({ services }: { services?: ImageInputServices | undefined }) {
  const tool = useEditorStore((s) => s.tool);
  if (!tool.imageInput) return null;
  return <BoundImageInput services={services} />;
}

function BoundImageInput({ services }: { services?: ImageInputServices | undefined }) {
  const store = useEditorStoreApi();
  const tool = useEditorStore((s) => s.tool);
  // One service (and worker) per mounted tool; disposed with it.
  const active = useMemo(() => services ?? browserImageInputServices(), [services]);
  const input = useImageInput(store, tool, active);
  return <ImageInputPanel input={input} />;
}
