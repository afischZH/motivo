/**
 * Template library of the social editor (M6-AP05), its own entry
 * (`@musterli/scene/templates`): the editor loads it with `import()` when
 * the picker opens or a template is picked, so the data stays out of the
 * landing pages and the editor's first chunk.
 */
import { createBackgroundLayer } from "../factory";
import { sceneFormat } from "../formats";
import { SCENE_VERSION, type Layer, type Scene } from "../schema";
import { ANNOUNCEMENT_TEMPLATES } from "./data/announcement";
import { EVENT_TEMPLATES } from "./data/event";
import { QUOTE_TEMPLATES } from "./data/quote";
import { SALE_TEMPLATES } from "./data/sale";
import { TEAM_TEMPLATES } from "./data/team";
import { TIP_TEMPLATES } from "./data/tip";
import type { SceneTemplate, TemplateBackground } from "./types";

export * from "./types";
export { LOGO_PLACEHOLDER_SVG } from "./build";

/** All templates, grouped by theme in picker order. */
export const TEMPLATES: readonly SceneTemplate[] = [
  ...ANNOUNCEMENT_TEMPLATES,
  ...QUOTE_TEMPLATES,
  ...EVENT_TEMPLATES,
  ...SALE_TEMPLATES,
  ...TIP_TEMPLATES,
  ...TEAM_TEMPLATES,
];

export function findTemplate(id: string): SceneTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** i18n key (below the editor's `templates.texts`) of a template's text layer. */
export function templateTextKey(template: Pick<SceneTemplate, "id">, layer: Pick<Layer, "id">) {
  return `${template.id}.${layer.id}`;
}

/** A background tool reference as the app resolves it from the registry. */
export interface ResolvedBackground {
  toolId: string;
  version: number;
  params: Record<string, unknown>;
  seed: number;
}

export interface TemplateDeps {
  /** The sample text of a text layer (`templateTextKey`), in the user's language. */
  text(key: string): string;
  /** The tool params of the background; `null` leaves the scene without background. */
  background(spec: TemplateBackground): ResolvedBackground | null;
}

/**
 * A new scene from a template, in its native format. Text boxes are as
 * designed; the editor fits them with the real fonts (Magic Resize into
 * the chosen format) before showing the scene.
 */
export function instantiateTemplate(template: SceneTemplate, deps: TemplateDeps): Scene {
  const format = sceneFormat(template.format);
  const layers: Layer[] = template.layers.map((l) =>
    l.kind === "text" ? { ...l, text: deps.text(templateTextKey(template, l)) } : { ...l },
  );
  const bg = deps.background(template.background);
  if (bg) {
    layers.unshift(
      createBackgroundLayer(
        "bg",
        format,
        { id: bg.toolId, version: bg.version, params: bg.params },
        bg.seed,
      ),
    );
  }
  return {
    version: SCENE_VERSION,
    format,
    palette: [...template.palette],
    layers,
    groups: template.groups.map((g) => ({ ...g, constraints: { ...g.constraints } })),
  };
}
