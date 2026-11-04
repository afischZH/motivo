/**
 * Shared pieces of the S2 shader tools: the motion and texture params
 * (moment, speed, grain, vignette), their controls and the loop length.
 * Same meaning as in the shader gradient (docs/TOOLS.md C4).
 */
import * as z from "zod";
import type { ControlGroup } from "../types";

/** Seconds of one preview loop at speed 1. */
export const SHADER_TOOL_LOOP_SECONDS = 12;

export const shaderMotionSchema = {
  /** Loop phase in percent: the still frame of every export. */
  time: z.number().min(0).max(100),
  /** Live preview and embeds: loops per `SHADER_TOOL_LOOP_SECONDS`, 0 = still. */
  speed: z.number().min(0).max(2),
  /** Percent. */
  grain: z.number().min(0).max(100),
  /** Percent. */
  vignette: z.number().min(0).max(100),
};

export const shaderLoopSeconds = (p: { speed: number }): number =>
  p.speed > 0 ? SHADER_TOOL_LOOP_SECONDS / p.speed : 0;

export const SHADER_MOTION_ORDER = ["time", "speed", "grain", "vignette"] as const;

export function shaderMotionGroups(id: string): ControlGroup[] {
  return [
    { id: "motion", labelKey: `tools.${id}.groups.motion` },
    { id: "texture", labelKey: `tools.${id}.groups.texture` },
  ];
}

export function shaderMotionControls(id: string) {
  return {
    time: {
      group: "motion",
      step: 1,
      unit: "%",
      descriptionKey: `tools.${id}.params.time.description`,
    },
    speed: {
      group: "motion",
      step: 0.05,
      descriptionKey: `tools.${id}.params.speed.description`,
    },
    grain: { group: "texture", step: 1, unit: "%" },
    vignette: { group: "texture", step: 1, unit: "%" },
  } as const;
}
