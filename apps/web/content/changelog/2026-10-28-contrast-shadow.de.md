---
date: 2026-10-28
title: Kontrast-Checker und CSS-Schatten
tools: [contrast-checker, css-shadow]
---

**Neu: Kontrast-Checker.**

- Prüft Text- und Hintergrundfarbe nach WCAG 2: AA und AAA für normalen und grossen Text sowie 3:1 für Bedienelemente. Werte werden abgerundet, damit nie ein knapp verfehltes AA als bestanden erscheint.
- Reicht der Kontrast nicht, schlägt Musterli die nächstgelegene Farbe vor, die AA oder AAA schafft. Nur die Helligkeit ändert sich, ein Klick übernimmt sie.
- Simulation von Protanopie, Deuteranopie, Tritanopie (nach Machado, Oliveira und Fernandes 2009) und Achromatopsie, samt Kontrast der simulierten Farben.
- Kontrastmatrix für alle Paare einer Palette, Brand-Palette und Pipette (wo der Browser sie kennt). Export als CSS-Variablen, Bericht als Text, SVG oder PNG.

**Neu: CSS-Schatten-Generator.**

- Weiche Schatten aus bis zu acht Ebenen, deren Abstand und Unschärfe linear, mit Ease-out oder exponentiell wachsen. Lichtrichtung, Ausdehnung, Deckkraft und Innenschatten einstellbar.
- Die Schattenfarbe kommt standardmässig aus dem Hintergrund statt aus reinem Schwarz.
- Die Vorschau ist echtes CSS auf einer Karte oder einem Button, auf einem Musterli-Hintergrund nach Wahl.
- Export als box-shadow, Tailwind-Klasse, Tailwind-v4-Variable in @theme, CSS-Variable, filter: drop-shadow() sowie als SVG, PNG und WebP.
