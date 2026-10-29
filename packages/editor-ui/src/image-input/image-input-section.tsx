"use client";

import { useEffect, useMemo } from "react";
import type { IncomingImage } from "../handoff/use-handoff-receiver";
import { useEditorStore, useEditorStoreApi } from "../store/react";
import { ImageInputPanel } from "./image-input-panel";
import { browserImageInputServices, type ImageInputServices } from "./services";
import { useImageInput } from "./use-image-input";

/**
 * The image input of the current tool, bound to the editor store. Renders
 * nothing for tools without `imageInput`. With `photoSource` the picture
 * comes from the photo field in the settings, so only the analysis runs
 * here and the picker stays hidden.
 */
export function ImageInputSection({
  services,
  incoming,
}: {
  services?: ImageInputServices | undefined;
  /** A picture handed over from another tool ("Weiterverwenden in"), loaded like a picked file. */
  incoming?: IncomingImage | null;
}) {
  const tool = useEditorStore((s) => s.tool);
  if (!tool.imageInput) return null;
  return (
    <BoundImageInput
      services={services}
      hidden={tool.photoSource !== undefined}
      incoming={incoming ?? null}
    />
  );
}

function BoundImageInput({
  services,
  hidden,
  incoming,
}: {
  services?: ImageInputServices | undefined;
  hidden: boolean;
  incoming: IncomingImage | null;
}) {
  const store = useEditorStoreApi();
  const tool = useEditorStore((s) => s.tool);
  // One service (and worker) per mounted tool; disposed with it.
  const active = useMemo(() => services ?? browserImageInputServices(), [services]);
  const input = useImageInput(store, tool, active);
  const { loadFile } = input;
  // The same checks as a picked file: size, magic bytes, pixel count, decode in the worker.
  useEffect(() => {
    if (incoming && !hidden) loadFile(incoming.file);
  }, [incoming, hidden, loadFile]);
  return hidden ? null : <ImageInputPanel input={input} />;
}
