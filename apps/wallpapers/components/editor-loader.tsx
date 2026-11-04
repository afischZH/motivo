"use client";

import dynamic from "next/dynamic";

import type { EditorLabels } from "./wallpaper-editor";

/*
 * The editor needs the screen size and the URL hash to start, and loads the
 * generator registry: client only, loaded after the page shell.
 */
const WallpaperEditor = dynamic(() => import("./wallpaper-editor"), {
  ssr: false,
  loading: () => null,
});

interface EditorLoaderProps {
  locale: string;
  labels: EditorLabels;
  loading: string;
  initialDeviceId?: string;
}

export function EditorLoader({ locale, labels, loading, initialDeviceId }: EditorLoaderProps) {
  return (
    <div className="relative min-h-[480px]">
      <p className="text-muted absolute inset-x-0 top-8 -z-10 text-center">{loading}</p>
      <WallpaperEditor locale={locale} labels={labels} initialDeviceId={initialDeviceId} />
    </div>
  );
}
