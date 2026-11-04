import { DEVICE_GROUPS } from "@musterli/devices";
import { getMessages, getTranslations } from "next-intl/server";

import type { EditorLabels } from "@/components/wallpaper-editor";
import type { AppLocale } from "@/i18n/routing";

/** Resolves every editor text on the server, so the client loads no formatter. */
export async function editorLabels(locale: AppLocale): Promise<EditorLabels> {
  const e = await getTranslations({ locale, namespace: "Editor" });
  const h = await getTranslations({ locale, namespace: "Home" });
  const { Tools: tools } = await getMessages({ locale });
  return {
    device: e("device"),
    yourScreen: e("yourScreen", { size: "{size}" }),
    customSize: e("customSize"),
    width: e("width"),
    height: e("height"),
    style: e("style"),
    look: e("look"),
    newLook: e("newLook"),
    newLookHint: e("newLookHint"),
    safeZones: e("safeZones"),
    downloadPng: e("download", { format: "PNG" }),
    downloadJpg: e("download", { format: "JPG" }),
    exporting: e("exporting"),
    exportFailed: e("exportFailed"),
    copyLink: e("copyLink"),
    linkCopied: e("linkCopied"),
    previewAlt: e("previewAlt", { size: "{size}" }),
    sizeNote: e("sizeNote", { size: "{size}" }),
    finish: e("finish"),
    grain: e("grain"),
    dim: e("dim"),
    calmClock: e("calmClock"),
    sets: e("sets"),
    downloadPair: e("downloadPair"),
    downloadSet: e("downloadSet", { group: "{group}" }),
    progress: e("progress", { done: "{done}", total: "{total}" }),
    groups: Object.fromEntries(DEVICE_GROUPS.map((group) => [group, h(`groups.${group}`)])),
    zones: {
      clock: e("zones.clock"),
      statusBar: e("zones.statusBar"),
      menuBar: e("zones.menuBar"),
      dock: e("zones.dock"),
    },
    tools,
  };
}
