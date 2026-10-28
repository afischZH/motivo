"use client";

import { EditorShell, EditorStoreProvider } from "@motivo/editor-ui";
import { createDesignStore } from "@motivo/storage";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Link } from "@/i18n/client-navigation";

/**
 * Client entry of the editor page. Tool definitions hold functions and
 * cannot cross the server/client boundary, so only the id is passed and the
 * store looks the tool up in the registry. One store per page: remounting
 * with another tool id (`key`) starts fresh from that tool's defaults.
 */
export function ToolEditor({ toolId }: { toolId: string }) {
  const t = useTranslations("ToolPage");
  // Saved designs live in this browser only (IndexedDB, opened on first use).
  const [designs] = useState(() => createDesignStore());
  useEffect(() => () => designs.close(), [designs]);

  return (
    <EditorStoreProvider key={toolId} options={{ toolId }}>
      <EditorShell
        designs={designs}
        headerStart={
          <Link
            href="/tools"
            className="rounded-control text-sm text-link underline-offset-4 hover:underline"
          >
            {t("allTools")}
          </Link>
        }
        // Quiet donation hint after a successful export (M3-AP14). A new tab,
        // so the design in the editor stays as it is.
        afterExport={t.rich("supportHint", {
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
      />
    </EditorStoreProvider>
  );
}
