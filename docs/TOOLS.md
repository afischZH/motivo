# TOOLS.md: Tool-Spezifikationen

Jedes Tool wird als `ToolDefinition` umgesetzt (siehe `ARCHITECTURE.md`, Abschnitt 4). Pro Tool: Zweck, Parameter, Algorithmus-Skizze, Exporte, Gating, Phase.

Legende Phase: **M1** bis **M7** = Meilensteine aus `ROADMAP.md`. **G** = gratis nutzbar, **P** = Teile nur mit Lifetime-Lizenz. "Lifetime" heisst in diesem Dokument jede Lizenzstufe (Solo oder Pro); was nur mit **Lifetime Pro** geht, ist explizit so bezeichnet (Stufen siehe `PRODUCT.md` 6.1).

Allgemein gilt für alle visuellen Tools: Parameter `width`, `height` (mit Grössen-Presets: Social, Desktop, Mobile, A4), `background` (Farbe oder transparent), `palette` (2 bis 10 Farben, Brand-Paletten wählbar), `seed`.

---

## A. Patterns

### A1. Geometric Patterns (Flaggschiff) · M4 · G/P
- **Zweck**: Raster aus Kacheln mit geometrischen Shapes.
- **Parameter**: `pack` (oder Mehrfachauswahl einzelner Shapes), `gridMode` (`uniform` | `dynamic`), `columns`/`tileSize`, `padding`, `gap`, `rotationMode` (`none` | `quarter` | `free`), `colorMode` (pro Kachel zufällig | pro Shape-Ebene), `duotoneOpacity`, `strokeOnly`, Locks.
- **Algorithmus**: Uniform: Kachelgitter, pro Zelle Shape + Farbe + Rotation per PRNG. Dynamic: rekursive Unterteilung (Quadtree-artig, Zelle mit Wahrscheinlichkeit p in 4 oder 2 Teile splitten bis Mindestgrösse). Shapes sind 100x100-SVG-Pfade, Farbe wird beim Rendern über `fill` gesetzt, Opazität bleibt erhalten (Duotone).
- **Kachel-Editing**: Klick auf Kachel öffnet Mini-Popover (Shape tauschen, Farbe, Rotation). Overrides als `tileOverrides: Record<cellId, Partial<Tile>>` speichern.
- **Exporte**: SVG, CSS (data-URI, `background-repeat` wenn Kachel kachelbar), PNG/JPG/WebP, GIF (Frames = neue Seeds oder Farbwechsel).
- **Gating**: Free: 5 offizielle Packs, max. 1080 px. Lifetime: alle Packs, eigene Packs, GIF, Tile-Editing, 4K. Lifetime Pro: 8K, React-Komponente.
- **Eigene Bibliothek**: Wir zeichnen eine eigene Startbibliothek (Ziel 150+ Shapes, 12 Packs) oder nutzen CC0-Quellen mit dokumentierter Lizenz.

### A2. Seamless Patterns · M4 · G/P
- **Zweck**: Nahtlos kachelbare Muster aus einem Shape, Text-Glyph, Emoji (Lizenz prüfen) oder Bild.
- **Parameter**: `source` (Shape | Upload SVG | Upload Bild mit Crop), `tiling` (`grid` | `brick` | `halfDrop` | `mirror`), `scale`, `spacingX/Y`, `rotation`, `jitter`, `keepOriginalColors`.
- **Algorithmus**: Eine Musterkachel (Tile) berechnen; Elemente, die den Rand schneiden, an den gegenüberliegenden Seiten duplizieren (Offset ±tileW/±tileH), damit das Tile nahtlos ist. Brick = Zeilenversatz 50 %, Half-Drop = Spaltenversatz 50 %, Mirror = alternierende Spiegelung.
- **Exporte**: SVG (`<pattern>` + Rect), CSS (Tile als data-URI mit `background-size`), PNG-Tile und PNG-Fläche.

### A3. Polka Dots, Grid Patterns, Confetti, Starry Sky, Dieter Dots · M2/M3 · G
- Einfache SVG-Generatoren mit wenigen Parametern (Dichte, Grösse, Varianz, Farbe, Form). Dieter Dots: konzentrische Ringe aus Punkten (`rings`, `dotsPerRing`, `ringSpacing`, `scale`).
- Confetti/Starry Sky: Poisson-Disk-Sampling (Bridson) für gleichmässige, natürliche Verteilung.

### A4. Doodle Backgrounds · M3 · G
- Handgezeichnet wirkende Formen: Linien/Pfade mit leichtem Rauschen (Perlin-Offset der Kontrollpunkte), runde Linienenden, Verteilung per Poisson-Disk.

## B. CSS-Patterns

### B1. CSS Pattern Library + Editor · M2 · G
- **Bibliothek**: Kategorien Dots, Grid, Stripes, Waves, Geometric (Chevron, Diamond, Checkerboard, Zigzag). Jedes Pattern ist eine Funktion `(colors, size, angle, opacity) => string` mit reinem CSS (`radial-gradient`, `linear-gradient`, `conic-gradient`, `repeating-*`).
- **Editor**: mehrere Pattern-Ebenen stapeln (CSS erlaubt mehrere `background-image`), pro Ebene Farbe, Grösse, Rotation (via `background` auf Pseudo-Element oder SVG-Fallback), Opazität.
- **Exporte**: CSS-Snippet, Tailwind-Arbitrary-Value, SVG-Fallback, PNG.
- SEO-Magnet: Jedes Pattern bekommt eine eigene indexierbare Detailseite.

### B2. CSS Gradient Generator · M1 · G
- Linear, radial, conic; Farbstopps mit Drag; **Easing** der Übergänge (Zwischenstopps entlang Easing-Kurve, um Banding zu vermeiden); Interpolation in OKLCH (`in oklch` Syntax mit Fallback).
- Exporte: CSS, Tailwind, SVG, PNG. Teilen per Link.

## C. Gradients

### C1. Mesh Gradients · M3 · G/P
- **Parameter**: Palette (Drag-to-reorder), `points` (3 bis 8), `blur`, `warp`, `grain`, `seed`.
- **Algorithmus (SVG)**: farbige Ellipsen/Pfade an PRNG-Positionen, `feGaussianBlur` für weiche Übergänge, optional `feTurbulence` + `feDisplacementMap` für "Flüssig"-Verzerrung, Grain als zusätzliche `feTurbulence`-Ebene mit Blend-Mode. **Illustrator-Kompatibilität testen**, zusätzlich Raster-Export.
- Später (P2): Animation (Punkte auf Lissajous-Bahnen) ► Video.

### C2. Blurry Gradients · M3 · G
- 2 bis 5 Kreise, Positionierung an Ecken/Mitte, Opazität, starker Blur, Grain. SVG + PNG.

### C3. Striped Gradients · M3 · G
- Vertikale Bänder, jedes Band mit eigenem linearen Verlauf aus der Palette, leichter Versatz. SVG/PNG.

### C4. Shader Gradient Editor · M5 · G/P
- **Parameter**: 2 bis 6 Farben, `style` (Liquid, Silk, Streaked, Grainy als Presets), `frequency`, `amplitude`, `warp` (Domain-Warping-Stärke), `speed`, `dither` (aus/Bayer 2/4/8, Stufenanzahl), `grain`, `vignette`, `angle`, `zoom`.
- **Algorithmus (GLSL, WebGL2)**: Simplex/Value-Noise, Domain Warping (`p += warp * noise(p)` mehrfach), Ergebnis als Index in eine Farbrampe (Palette als 1D-Texture), danach Bayer-Dithering (Schwellwert-Matrix), Film Grain (Hash-Noise pro Pixel und Frame), Vignette.
- **Video-Modus**: Keyframes für numerische Parameter über Zeit, Timeline-UI, Loop-Länge, nahtloser Loop durch periodische Zeitfunktion (`t` auf Kreis abbilden: `noise(p, cos(2πt), sin(2πt))`).
- **Exporte**: PNG/JPG (bis 8K via Kachel-Rendering), MP4/WebM, Clipboard; P2: Web-Component `<motivo-shader>` mit eingebettetem Shader.
- **Gating**: Free: Bild bis 1080 px. Lifetime: Bild bis 4K, Video bis 1080p. Lifetime Pro: Bild 8K, Video 4K, Web-Component.

## D. Backgrounds

### D1. Blob Generator · M1 · G
- **Algorithmus**: N Punkte auf Kreis (Winkel gleichmässig), Radius je Punkt `r * (1 ± randomness)`, geschlossene Catmull-Rom-Spline ► kubische Bezier ► SVG-Pfad.
- **Parameter**: `complexity` (Punkte), `randomness`, `fill` (Farbe | Outline | Verlauf | Bild | Pattern aus A1/A2).
- Exporte: SVG, PNG, CSS (`clip-path: path()` als Bonus).

### D2. Blob Composition · M3 · G/P
- Mehrere Blobs als Ebenen, Positionen an Ecken/Rändern, Brand-Farben, "Magic Resize" (Positionen relativ in % gespeichert).

### D3. SVG Waves · M1 · G
- Layers 1 bis 5, Punkte pro Welle, Amplitude, Glättung, Richtung (oben/unten), Farbverlauf über Layers. Spline wie bei Blobs, aber offen. Exporte: SVG, PNG, CSS.

### D4. 3D Perspective Grid · M5 · G
- Retro-Synthwave-Grid: Linien in Perspektive (einfache 3D-Projektion ohne three.js möglich), Horizont, Glow (Blur-Ebene), Nebel (Verlauf), Sonne optional, Animation (Grid fährt nach vorne) für Video.

### D5. SVG Charts (Platzhalter-Charts) · M3 · G
- Linien- und Balken-Diagramme mit Zufallsdaten für Mockups. Glättung, Achsen ein/aus, Farben.

## E. Image Effects (alle im Web Worker auf ImageData)

| Tool | Kernalgorithmus | Parameter | Phase |
|---|---|---|---|
| **E1 Noise/Grain** | Pro Pixel Zufallswert (Gauss), Blend-Modes (overlay, soft-light, multiply), monochrom/farbig | amount, size, blend, mono | M2 |
| **E2 Halftone** | Bild in Zellen (rotiert um Winkel), Luminanz pro Zelle ► Punktradius; Formen: Kreis, Linie, Quadrat; zweifarbig | cellSize, angle, shape, colors, contrast | M5 |
| **E3 CMYK Halftone** | RGB ► CMYK, pro Kanal Halftone mit klassischen Rasterwinkeln (C 15°, M 75°, Y 0°, K 45°), multiplikativ überlagern | cellSize, Winkel pro Kanal, Registerversatz | M5 |
| **E4 Dither** | Floyd-Steinberg, Atkinson, Bayer (2/4/8), Stucki; Paletten (1-bit, Gameboy, eigene) | algorithm, palette, scale (Pixelgrösse), contrast | M5 |
| **E5 God Rays** | Radiale Unschärfe von Lichtquelle aus (Sample entlang Strahl Richtung Quelle, Decay), additiv mischen | position, intensity, decay, samples, color | M6 |
| **E6 Fractal Glass** | Bild in vertikale Streifen, pro Streifen horizontale Verschiebung + Spiegelung/Skalierung (Refraktion simulieren), optional Blur und Glanzlicht | stripWidth, distortion, angle, highlight | M6 |
| **E7 Pixelate/Posterize** (Bonus) | Blockmittelwert, Farbquantisierung | size, levels | M6 |

- Upload: max. 20 MB, wird clientseitig auf Arbeitsauflösung skaliert; Original nur lokal, nicht hochgeladen (Datenschutz-Pluspunkt, kommunizieren!).

## F. Colors

| Tool | Funktion | Phase |
|---|---|---|
| **F1 Palette Generator** | Leertaste = neue Palette, Locks, Harmonien (analog, komplementär, triadisch, split, tetradisch) in OKLCH, Kontrastanzeige (WCAG), Speichern ins Brand Kit | M2 |
| **F2 Tints & Shades** | Skala aus Basisfarbe (Mischung mit Weiss/Schwarz bzw. OKLCH-Lightness-Rampe), Export HEX/RGB/HSL/CSS-Variablen | M2 |
| **F3 Tailwind Palette** | 11 Stufen 50 bis 950, Basis auf 500 verankern, Lightness-Kurve + leichte Chroma-Reduktion an den Rändern; Export `tailwind.config.js`, `@theme`-Variablen (Tailwind v4), OKLCH, HEX | M2 |
| **F4 Palette aus Bild** | Bild clientseitig, k-Means in OKLab (oder Median Cut) im Worker, 3 bis 10 Farben, sortiert nach Anteil | M2 |
| **F5 Gradient-, Paletten-Sammlungen** | Programmatic-SEO-Seiten (kuratiert + Community) | M3 |

## G. Converters (alle rein clientseitig, gratis, SEO-Magneten) · M1

SVG zu CSS (url-encoded data-URI), SVG zu Base64, CSS zu SVG (data-URI parsen), Base64 zu SVG, Bild zu Base64 (optional Komprimierung via Canvas), Base64 zu Bild. Jede Seite mit Erklärung, Beispielen und FAQ.

## H. Social Media Editor · M6 · G/P
- **Canvas** (Konva) mit Ebenen: Hintergrund (beliebiges Motivo-Design als Live-Referenz oder gerendertes Bild), Text, Bilder, Shapes, Logo aus Brand Kit.
- **Text-Effekte**: Schatten, Outline, Verlauf, "Highlight-Balken", Gradient-Fill; eigene und Google Fonts (Lizenz der Fonts prüfen: nur OFL/Apache).
- **Grössen**: Instagram Feed (1080x1080, 1080x1350), Story (1080x1920), LinkedIn, X/Twitter, Facebook, Pinterest, YouTube-Thumbnail; Werte bei Umsetzung aktuell recherchieren.
- **Magic Resize**: Layout-Constraints pro Ebene (Anker + relative Grösse), beim Formatwechsel neu berechnen; danach manuell feinjustieren.
- **Templates**: als JSON (Konva-Szene mit Platzhaltern), eigene Vorlagenbibliothek (Ziel 100 zum Launch des Editors).
- **Brand-Apply**: Ein Klick ersetzt Template-Farbslots durch Brand-Palette und Fonts.
- Exporte: PNG/JPG; Free mit dezentem Wasserzeichen.

## I. Composer (Differenzierung) · M7 · P
- Generalisierung des Social-Editors: beliebige Tool-Ergebnisse als Ebenen mit Blend-Modes und Masken (z. B. Pattern nur innerhalb eines Blobs). Ebenen bleiben **parametrisch** (Klick auf Ebene öffnet das Tool-Panel).
- Exporte: PNG/JPG/WebP, SVG wenn alle Ebenen vektoriell sind.

---

## Umsetzungsreihenfolge (Zusammenfassung)

1. **M1**: CSS Gradient, Blob, Waves, Converters (einfach, beweisen die Tool-Architektur)
2. **M2**: CSS Patterns + Editor, Farbtools, Noise, Polka/Grid/Confetti/Dieter Dots
3. **M3**: Mesh, Blurry, Striped, Blob Composition, Doodles, Charts, Sammlungsseiten
4. **M4**: Geometric + Seamless Patterns, Packs, GIF
5. **M5**: Shader Gradient (+ Video), Perspective Grid, Halftone, CMYK, Dither
6. **M6**: God Rays, Fractal Glass, Social Media Editor
7. **M7**: Composer, Community-Ausbau, API, Plugins, KI
