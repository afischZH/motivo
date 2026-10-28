/**
 * Server-side texts of the collection pages. Keys are built from item ids,
 * which next-intl's typed keys cannot know, hence the loose translator.
 */
import { getTranslations } from "next-intl/server";

import type { SwatchListText } from "@/components/collections/swatch-list";
import type { EnabledLocale } from "@/i18n/locales";

export type Text = (key: string, values?: Record<string, string | number>) => string;

export async function collectionText(locale: EnabledLocale): Promise<Text> {
  const t = await getTranslations({ locale });
  return t as unknown as Text;
}

/** Texts of the swatch list and its copy buttons. */
export function swatchText(t: Text): SwatchListText {
  return {
    colorLabel: (index) => t("Collections.colorLabel", { index }),
    format: (format) => t(`Collections.formats.${format}`),
    copyBefore: t("Collections.copyBefore"),
    copyAfter: t("Collections.copyAfter"),
    contrast: (text, ratio) => t("Collections.contrast", { text, ratio }),
    black: t("Collections.black"),
    white: t("Collections.white"),
    copied: t("Collections.copiedShort"),
    failed: t("Collections.copyFailedShort"),
  };
}

/** Texts of a `CodeBlock`. */
export function codeText(t: Text, format: string) {
  return {
    title: format,
    copy: t("Collections.copy"),
    copyLabel: t("Collections.copyLabel", { format }),
    copied: t("Collections.copied"),
    copyFailed: t("Collections.copyFailed"),
  };
}
