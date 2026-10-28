"use client";

import { EditorShell, EditorStoreProvider } from "@musterli/editor-ui";
import { createBrandKitStore, createDesignStore } from "@musterli/storage";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Link } from "@/i18n/client-navigation";

/**
 * Client entry of the editor page. Tool definitions hold functions and
 * cannot cross the server/client boundary, so only the id is passed and the
 * store looks the tool up in the registry. One store per page: remounting
 * with another tool id (`key`) starts fresh from that tool's defaults.
 */
export function ToolEditor({ toolId, brandKitHref }: { toolId: string; brandKitHref: string }) {
  const t = useTranslations("ToolPage");
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
        headerStart={
          <Link
            href="/tools"
            className="rounded-control text-sm text-link underline-offset-4 hover:underline"
          >
            {t("allTools")}
          </Link>
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
