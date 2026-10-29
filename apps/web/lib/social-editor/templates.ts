/**
 * Templates in the app (M6-AP05): the background of a template resolved
 * against the tool registry (preset params, changes on top, validated by
 * the tool schema) and a scene in the user's language. Pure, shared by the
 * editor and the template tests. The template data itself is loaded with
 * `import("@musterli/scene/templates")` where it is needed, so this module
 * imports only its types.
 */
import { sceneFormat, resizeScene, type Scene, type TextMeasure } from "@musterli/scene";
import type {
  ResolvedBackground,
  SceneTemplate,
  TemplateBackground,
} from "@musterli/scene/templates";
import { parseToolParams, registry } from "@musterli/tool-registry";

/** The tool params of a template background; `null` if the tool or preset is unknown or invalid. */
export function resolveTemplateBackground(spec: TemplateBackground): ResolvedBackground | null {
  const tool = registry.get(spec.toolId);
  const preset = tool?.presets.find((p) => p.id === spec.preset);
  if (!tool || !preset) return null;
  const parsed = parseToolParams(tool, {
    ...(preset.params as Record<string, unknown>),
    ...spec.params,
  });
  if (!parsed.success) return null;
  return {
    toolId: tool.id,
    version: tool.version,
    params: parsed.data as Record<string, unknown>,
    seed: spec.seed ?? preset.seed ?? 1,
  };
}

/** i18n key (below `SocialEditor.templates`) of a template text. */
export const templateTextMessageKey = (key: string) => `texts.${key}`;

/** `instantiateTemplate` of the lazily loaded template library. */
export type InstantiateTemplate = typeof import("@musterli/scene/templates").instantiateTemplate;

/**
 * A template as a new scene in `formatId` (its native format when
 * `null`): texts from `text`, then fitted with `measure` through Magic
 * Resize, the same path as a format change, so nothing is cut off with
 * the real fonts.
 */
export function templateScene(
  instantiate: InstantiateTemplate,
  template: SceneTemplate,
  text: (key: string) => string,
  measure: TextMeasure,
  formatId: string | null = null,
): Scene {
  const scene = instantiate(template, { text, background: resolveTemplateBackground });
  return resizeScene(scene, sceneFormat(formatId ?? template.format), { measure });
}
