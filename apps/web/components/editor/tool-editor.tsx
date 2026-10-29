"use client";

import { ChevronLeftIcon } from "lucide-react";
import { EditorShell, EditorStoreProvider } from "@musterli/editor-ui";
import { openToolSwitcher } from "@musterli/editor-ui/commands";
import { createBrandKitStore, createDesignStore } from "@musterli/storage";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { FavoriteButton } from "@/components/tool-history/favorite-button";
import { Link } from "@/i18n/client-navigation";
import { isEnabledLocale } from "@/i18n/locales";
import { routePath } from "@/i18n/paths";
import { recordToolVisit } from "@/lib/tool-history";

/**
 * Client entry of the editor page. Tool definitions hold functions and
 * cannot cross the server/client boundary, so only the id is passed and the
 * store looks the tool up in the registry. One store per page: remounting
 * with another tool id (`key`) starts fresh from that tool's defaults.
 */
export function ToolEditor({ toolId, brandKitHref }: { toolId: string; brandKitHref: string }) {
  const t = useTranslations("ToolPage");
  const locale = useLocale();
  const router = useRouter();
  const tTools = useTranslations("tools") as unknown as (key: string) => string;
  // "Zuletzt benutzt" in the command palette and the catalogue (this browser only).
  useEffect(() => recordToolVisit(toolId), [toolId]);
  // "Weiterverwenden in": client-side navigation, so the picture handed over
  // in this tab's memory reaches the other editor (never a server).
  const openTool = useCallback(
    (targetId: string, hash: string) => {
      if (!isEnabledLocale(locale)) return;
      router.push(`${routePath({ page: "tool", toolId: targetId }, locale)}${hash}`);
    },
    [locale, router],
  );
  // Saved designs and the brand kit live in this browser only (IndexedDB, opened on first use).
  const [designs] = useState(() => createDesignStore());
  const [brandKit] = useState(() => createBrandKitStore());
  useEffect(
    () => () => {
      designs.close();
      brandKit.close();
    },
    [designs, brandKit],
  );

  return (
    <EditorStoreProvider key={toolId} options={{ toolId }}>
      <EditorShell
        designs={designs}
        brandKit={brandKit}
        brandKitHref={brandKitHref}
        onOpenTool={openTool}
        // The tool name pill opens the command palette with the tools only.
        onSwitchTool={openToolSwitcher}
        headerStart={
          <>
            <Link
              href="/tools"
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border bg-background ps-1.5 pe-3 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronLeftIcon aria-hidden="true" className="size-4" />
              <span className="max-xl:sr-only">{t("allTools")}</span>
            </Link>
            <FavoriteButton
              toolId={toolId}
              label={t("favorite", { tool: tTools(`${toolId}.name`) })}
            />
          </>
        }
        // Quiet hints after a successful export: free use of the export
        // (M4-AP07) and donations (M3-AP14). New tabs, so the design in the
        // editor stays as it is.
        afterExport={
          <div className="flex flex-col gap-1">
            <p data-testid="export-terms-hint">
              {t.rich("termsHint", {
                link: (chunks) => (
                  <Link
                    href="/terms"
                    target="_blank"
                    rel="noopener"
                    className="rounded-control text-link underline underline-offset-4"
                    data-testid="export-terms-link"
                  >
                    {chunks}
                    <span className="sr-only"> {t("newTab")}</span>
                  </Link>
                ),
              })}
            </p>
            <p data-testid="export-support-hint">
              {t.rich("supportHint", {
                link: (chunks) => (
                  <Link
                    href="/support"
                    target="_blank"
                    rel="noopener"
                    className="rounded-control text-link underline underline-offset-4"
                    data-testid="export-support-link"
                  >
                    {chunks}
                    <span className="sr-only"> {t("newTab")}</span>
                  </Link>
                ),
              })}
            </p>
          </div>
        }
      />
    </EditorStoreProvider>
  );
}
