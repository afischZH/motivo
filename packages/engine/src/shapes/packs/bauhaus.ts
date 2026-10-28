/** Bauhaus: circles, halves, quarters and bars in the spirit of modernist posters. */
import { annulus, band, disc, poly, polar, rect, sector } from "../geometry";
import type { PackBuilders } from "../types";

export const bauhaus = {
  "split-circle": () => ({ d: sector(-1.5, 0, 48, 90, 270), accent: sector(1.5, 0, 48, -90, 90) }),
  "circle-square": () => ({
    d: `${rect(-46, -46, 92, 92)}${disc(0, 0, 30, true)}`,
    accent: disc(0, 0, 22),
  }),
  quarters: () => ({
    d: sector(-48, -48, 46, 0, 90) + sector(48, 48, 46, 180, 270),
    accent: sector(2, -2, 46, 270, 360) + sector(-2, 2, 46, 90, 180),
  }),
  lens: () => "M-48 0A60 60 0 0 1 48 0A60 60 0 0 1 -48 0Z",
  target: () => ({ d: annulus(0, 0, 32, 48), accent: disc(0, 0, 18) }),
  bars: () => rect(-46, -14, 26, 60) + rect(-13, -44, 26, 90) + rect(20, 6, 26, 40),
  dome: () => sector(0, 4, 44, 180, 360) + rect(-44, 12, 88, 20),
  "arc-thick": () => band(0, 22, 22, 48, 180, 360),
  "quarter-arc": () => band(-46, 46, 48, 92, 270, 360),
  steps: () =>
    poly([
      [-46, 46],
      [-46, 14],
      [-14, 14],
      [-14, -18],
      [18, -18],
      [18, -46],
      [46, -46],
      [46, 46],
    ]),
  "d-shape": () => rect(-44, -44, 44, 88) + sector(0, 0, 44, -90, 90),
  "split-square": () => ({
    d: poly([
      [-46, -46],
      [43, -46],
      [-46, 43],
    ]),
    accent: poly([
      [46, -43],
      [46, 46],
      [-43, 46],
    ]),
  }),
  "dot-grid": () => {
    const parts: string[] = [];
    for (const y of [-32, 0, 32]) for (const x of [-32, 0, 32]) parts.push(disc(x, y, 11));
    return parts.join("");
  },
  "cross-circle": () =>
    [0, 90, 180, 270]
      .map((a) => {
        const [cx, cy] = polar(3, a + 45);
        return sector(cx, cy, 46, a, a + 90);
      })
      .join(""),
} satisfies PackBuilders;
