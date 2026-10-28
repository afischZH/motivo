/**
 * Editor links of collection items. Separate from `variants.ts`, which the
 * OG image build script imports without the app's routing.
 */
import type { EnabledLocale } from "@/i18n/locales";
import { routePath } from "@/i18n/paths";
import { designEditorHash } from "@/lib/seo/motifs";

import { collectionTool, type CollectionVariant } from "./variants";

/** Editor URL of a variant: the tool's editor plus the share hash (`#d=`). */
export function variantEditorHref(variant: CollectionVariant, locale: EnabledLocale): string {
  const tool = collectionTool(variant.toolId);
  return `${routePath({ page: "tool", toolId: tool.id }, locale)}${designEditorHash(tool, variant.design)}`;
}
