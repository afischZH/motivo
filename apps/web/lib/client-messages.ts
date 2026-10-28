/**
 * Which messages reach the browser. `NextIntlClientProvider` without a
 * `messages` prop serializes every message into each page's RSC payload
 * (tool SEO texts, legal texts: about 60 KB per locale). Client components
 * only need a few namespaces, so each provider passes exactly those.
 * Server components keep full access through `getTranslations`.
 *
 * The shared layout has no provider at all: language switch and theme
 * toggle get their texts as props from server components, so landing pages
 * load no client message formatter (about 19 KB gzip).
 */
type Messages = Record<string, unknown>;

/** Converter pages: the converter UI. */
export const CONVERTER_CLIENT_NAMESPACES = ["Converters"] as const;

/**
 * Editor pages: page chrome, editor shell, saving, tool texts (`tools.*`)
 * and the names of the shape library (`Shapes.*`, about 4 KB).
 */
export const EDITOR_CLIENT_NAMESPACES = [
  "ToolPage",
  "Editor",
  "Designs",
  "sizes",
  "tools",
  "Shapes",
] as const;

/** "Meine Designs": only its own texts (tool names come as props). */
export const MY_DESIGNS_CLIENT_NAMESPACES = ["Designs"] as const;

/** Brand Kit page: only its own texts. */
export const BRAND_KIT_CLIENT_NAMESPACES = ["BrandKit"] as const;

/** The given top-level namespaces; missing ones are skipped. */
export function pickMessages(messages: Messages, namespaces: readonly string[]): Messages {
  return Object.fromEntries(
    namespaces.filter((ns) => Object.hasOwn(messages, ns)).map((ns) => [ns, messages[ns]]),
  );
}

/**
 * Editor messages without the tools' SEO texts (`tools.<id>.seo`), which
 * only the server-rendered landing pages read.
 */
export function editorMessages(messages: Messages): Messages {
  const picked = pickMessages(messages, EDITOR_CLIENT_NAMESPACES);
  const tools = picked.tools;
  if (typeof tools !== "object" || tools === null) return picked;
  return {
    ...picked,
    tools: Object.fromEntries(
      Object.entries(tools as Messages).map(([id, entry]) => {
        if (typeof entry !== "object" || entry === null) return [id, entry];
        const rest: Messages = { ...(entry as Messages) };
        delete rest.seo;
        return [id, rest];
      }),
    ),
  };
}
