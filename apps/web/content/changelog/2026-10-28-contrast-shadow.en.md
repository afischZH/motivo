---
date: 2026-10-28
title: Contrast Checker and CSS Shadows
tools: [contrast-checker, css-shadow]
---

**New: Contrast Checker.**

- Checks text and background colors against WCAG 2: AA and AAA for normal and large text, plus 3:1 for UI components. Values are rounded down, so a near miss never looks like a pass.
- If the contrast falls short, Musterli suggests the nearest color that reaches AA or AAA. Only the lightness changes, and one click applies it.
- Simulation of protanopia, deuteranopia, tritanopia (after Machado, Oliveira and Fernandes 2009) and achromatopsia, including the contrast of the simulated colors.
- Contrast matrix for all pairs of a palette, brand palettes and the eyedropper (where the browser supports it). Export as CSS variables, a text report, SVG or PNG.

**New: CSS Shadow Generator.**

- Soft shadows from up to eight layers whose distance and blur grow linearly, with ease-out or exponentially. Light direction, spread, opacity and inner shadows included.
- By default the shadow color comes from the background instead of pure black.
- The preview is real CSS on a card or a button, on a Musterli background of your choice.
- Export as box-shadow, a Tailwind class, a Tailwind v4 @theme variable, a CSS variable, filter: drop-shadow() and as SVG, PNG and WebP.
