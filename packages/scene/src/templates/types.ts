/**
 * Templates of the social editor (M6-AP05): scenes designed for Musterli,
 * with placeholder texts from i18n keys and a background that references a
 * Musterli tool preset (so every template also shows a tool).
 */
import type { Layer, SceneGroup } from "../schema";

/** Themes of the template picker, in picker order. */
export const TEMPLATE_THEMES = ["announcement", "quote", "event", "sale", "tip", "team"] as const;
export type TemplateTheme = (typeof TEMPLATE_THEMES)[number];

/**
 * The background of a template: a preset of a background tool, optionally
 * with some params changed. Resolved against the tool registry by the app
 * (`instantiateTemplate`'s `background`), validated by the tool schema.
 */
export interface TemplateBackground {
  toolId: string;
  preset: string;
  params?: Readonly<Record<string, unknown>>;
  seed?: number;
}

export interface SceneTemplate {
  /** Stable id (kebab-case); also the i18n key of its name and texts. */
  id: string;
  theme: TemplateTheme;
  /** Id of the native format (`SOCIAL_FORMATS`); every other format works through Magic Resize. */
  format: string;
  /** Colours of the slots `brand-1` ...; Brand-Apply swaps them. */
  palette: readonly string[];
  background: TemplateBackground;
  /**
   * Layers above the background, in the native format. Text layers have an
   * empty `text`: it comes from the i18n key `<template id>.<layer id>`.
   */
  layers: readonly Layer[];
  groups: readonly SceneGroup[];
}
