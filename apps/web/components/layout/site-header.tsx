import { HeartIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { registry } from "@musterli/tool-registry";

import {
  CommandPalette,
  type CommandPaletteLabels,
  type PaletteLink,
} from "@/components/command-palette/command-palette";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { compilePath, routePath, type AppRoute } from "@/i18n/paths";
import { CONVERTER_IDS } from "@/lib/convert/ids";
import { toolKeys } from "@/lib/seo/tool-content";
import { TASK_IDS } from "@/lib/tasks";

import { HeaderNav, type HeaderNavItem } from "./header-nav";
import { LogoMark } from "./logo-mark";

/** Pages the command palette jumps to, in palette order, with their message keys. */
const PALETTE_PAGES: readonly { name: string; route: AppRoute }[] = [
  { name: "tools", route: { page: "tools" } },
  { name: "socialEditorApp", route: { page: "socialEditorApp" } },
  { name: "myDesigns", route: { page: "myDesigns" } },
  { name: "brandKit", route: { page: "brandKit" } },
  { name: "patterns", route: { page: "patterns" } },
  { name: "gradients", route: { page: "gradients" } },
  { name: "palettes", route: { page: "palettes" } },
  { name: "convert", route: { page: "convert" } },
  { name: "support", route: { page: "support" } },
  { name: "home", route: { page: "home" } },
];

export function SiteHeader() {
  const locale = useLocale() as EnabledLocale;
  const t = useTranslations("Layout");
  const tFooter = useTranslations("Footer");
  const tConvert = useTranslations("Converters");
  const tPatterns = useTranslations("PatternLibrary");
  const tTheme = useTranslations("Theme");
  const tDesigns = useTranslations("Designs");
  const tBrand = useTranslations("BrandKit");
  const tSocial = useTranslations("SocialLanding");
  const tPalette = useTranslations("CommandPalette");
  const tAll = useTranslations();
  // Tool and category keys are built from registry ids, which the typed keys cannot know.
  const text = tAll as unknown as (key: string) => string;

  const paletteLinks: PaletteLink[] = [
    ...PALETTE_PAGES.map(({ name, route }) => ({
      id: `page:${name}`,
      kind: "page" as const,
      label: text(`CommandPalette.pages.${name}`),
      href: routePath(route, locale),
      terms: "",
    })),
    ...TASK_IDS.map((task) => ({
      id: `task:${task}`,
      kind: "page" as const,
      label: text(`Tasks.${task}.name`),
      hint: tPalette("taskHint"),
      href: routePath({ page: "task", task }, locale),
      terms: task.replaceAll("-", " "),
    })),
    ...CONVERTER_IDS.map((id) => ({
      id: `converter:${id}`,
      kind: "converter" as const,
      label: text(`Converters.items.${id}.name`),
      hint: text("Categories.converters.name"),
      href: routePath({ page: "converter", converterId: id }, locale),
      terms: id.replaceAll("-", " "),
    })),
    ...registry.list().map((tool) => ({
      id: tool.id,
      kind: "tool" as const,
      label: text(toolKeys(tool.id).name),
      hint: text(`Categories.${tool.category[0]}.name`),
      href: routePath({ page: "tool", toolId: tool.id }, locale),
      // The English id helps on the German site ("flow field", "noise").
      terms: [
        tool.id.replaceAll("-", " "),
        ...tool.category.map((c) => text(`Categories.${c}.name`)),
      ].join(" "),
    })),
  ];
  const paletteLabels: CommandPaletteLabels = {
    open: tPalette("open"),
    title: tPalette("title"),
    placeholder: tPalette("placeholder"),
    toolPlaceholder: tPalette("toolPlaceholder"),
    empty: tPalette("empty"),
    groups: {
      actions: tPalette("groups.actions"),
      favorites: tPalette("groups.favorites"),
      recent: tPalette("groups.recent"),
      pages: tPalette("groups.pages"),
      tools: tPalette("groups.tools"),
    },
    editorCommands: {
      export: tPalette("editor.export"),
      newVariant: tPalette("editor.newVariant"),
      save: tPalette("editor.save"),
      copyImage: tPalette("editor.copyImage"),
      share: tPalette("editor.share"),
      applyBrandPalette: tPalette("editor.applyBrandPalette"),
      undo: tPalette("editor.undo"),
      redo: tPalette("editor.redo"),
      help: tPalette("editor.help"),
    },
    toggleTheme: tPalette("toggleTheme"),
    shortcutHint: tPalette("shortcutHint"),
  };

  const items: HeaderNavItem[] = [
    { href: compilePath("/tools", locale), label: t("toolsNav"), icon: "tools" },
    {
      href: compilePath("/social-editor", locale),
      label: tSocial("nav"),
      icon: "social",
      testId: "social-editor-nav",
    },
    { href: compilePath("/css-patterns", locale), label: tPatterns("nav"), icon: "patterns" },
    { href: compilePath("/convert", locale), label: tConvert("nav"), icon: "convert" },
    {
      href: compilePath("/my-designs", locale),
      label: tDesigns("nav"),
      icon: "designs",
      iconInBar: true,
      testId: "my-designs-nav",
    },
    {
      href: compilePath("/brand-kit", locale),
      label: tBrand("nav"),
      icon: "brandKit",
      iconInBar: true,
      testId: "brand-kit-nav",
    },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          aria-label={t("homeLink")}
          className="flex shrink-0 items-center gap-2.5 rounded-control text-base font-semibold tracking-tight"
        >
          <LogoMark className="size-7" />
          {t("brand")}
        </Link>
        <div className="max-lg:order-last">
          <HeaderNav
            items={items}
            supportHref={compilePath("/support", locale)}
            labels={{
              nav: t("mainNav"),
              menu: t("menu"),
              close: t("closeMenu"),
              brand: t("brand"),
              support: tFooter("support"),
            }}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 max-lg:ml-auto">
          <CommandPalette links={paletteLinks} labels={paletteLabels} />
          <Link
            href="/support"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "rounded-full max-lg:hidden",
            })}
          >
            <HeartIcon aria-hidden="true" className="text-link" />
            {t("supportCta")}
          </Link>
          {/* The visible hint uses the generic form; macOS users read ⌘ for Ctrl. */}
          <ThemeToggle label={tTheme("toggle")} hint={tTheme("hint", { shortcut: "⌘/Ctrl+⇧+K" })} />
        </div>
      </div>
    </header>
  );
}
