import type { ComponentType } from "react";
import {
  BrushIcon,
  FrameIcon,
  GridIcon,
  ImageIcon,
  PaletteIcon,
  PlayIcon,
  ShapesIcon,
  SlidersIcon,
  SparklesIcon,
  TypeIcon,
  WaveIcon,
} from "./icons";

/**
 * Icons of the settings sections, by control group id. Group ids are free per
 * tool, so the shell matches the common ones and falls back to sliders; a new
 * tool needs no entry here.
 */
const GROUP_ICONS: Record<string, ComponentType> = {
  colors: PaletteIcon,
  palette: PaletteIcon,
  tone: PaletteIcon,
  gradient: PaletteIcon,
  dark: PaletteIcon,
  pairs: PaletteIcon,
  check: PaletteIcon,
  shape: ShapesIcon,
  form: ShapesIcon,
  element: ShapesIcon,
  blocks: ShapesIcon,
  blobs: ShapesIcon,
  characters: TypeIcon,
  strips: ShapesIcon,
  layout: GridIcon,
  grid: GridIcon,
  tiles: GridIcon,
  scale: GridIcon,
  angles: GridIcon,
  view: FrameIcon,
  stage: FrameIcon,
  scene: FrameIcon,
  camera: FrameIcon,
  frame: FrameIcon,
  border: FrameIcon,
  device: FrameIcon,
  effects: SparklesIcon,
  effect: SparklesIcon,
  glow: SparklesIcon,
  light: SparklesIcon,
  rays: SparklesIcon,
  grain: SparklesIcon,
  texture: SparklesIcon,
  dither: SparklesIcon,
  overlay: SparklesIcon,
  glass: SparklesIcon,
  shadow: SparklesIcon,
  text: TypeIcon,
  type: TypeIcon,
  label: TypeIcon,
  content: TypeIcon,
  code: TypeIcon,
  data: TypeIcon,
  photo: ImageIcon,
  image: ImageIcon,
  screenshot: ImageIcon,
  screen: ImageIcon,
  background: ImageIcon,
  lines: WaveIcon,
  motion: PlayIcon,
  animation: PlayIcon,
  easing: PlayIcon,
  style: BrushIcon,
  card: BrushIcon,
};

/** The icon shown before a settings section title. */
export function groupIcon(groupId: string | null | undefined): ComponentType {
  return (groupId && GROUP_ICONS[groupId]) || SlidersIcon;
}
