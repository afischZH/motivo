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
- **Umsetzung M3** (Tool-ID `seamless-patterns`, aus M4 vorgezogen, M3-AP12): 24 eigene Shapes (Kreis, Ring, Quadrat, Raute, Dreieck, Sechseck, Stern, Funkeln, Herz, Blatt, Tropfen, Welle, Plus, Kreuz, Bogen, Blume, Klee, Mond, Halbkreis, Kapsel, Winkel, Sonne, Kiesel, Punkte) als Pfade in einer 100er-Box, alle mit Nonzero-Füllung; Auswahl über den Thumbnail-Picker. Kein Text-Glyph, keine Emojis. `source` ist implizit: Ist `upload` gesetzt, ist die eigene Datei das Motiv, sonst `shape`. Params: `shape`, `upload` (SVG oder PNG/JPEG-data-URI, siehe unten), `keepOriginalColors`, `tiling`, `size` (8 bis 400 px, statt `scale`), `spacingX/Y` (0 bis 400 px), `cells` (1 bis 6 Motive pro Kachelseite), `rotation` plus `rotationJitter`, `sizeVariance`, `jitter` (Anteil der Zelle), `colorMode` (eine Farbe oder Palette), `color`, `palette`, `background`. Kachel: `cells × cells` Zellen, Brick erzwingt eine gerade Zeilenzahl (Versatz um eine halbe Zelle in jeder zweiten Zeile), Half-Drop eine gerade Spaltenzahl, Mirror baut aus einem n × n-Block eine 2n × 2n-Kachel mit horizontaler, vertikaler und doppelter Spiegelung. Jede Platzierung wird mit allen Gitterversätzen (±Kachelbreite, ±Kachelhöhe) kopiert, deren Begrenzungskreis die Kachel schneidet; Tests prüfen für alle vier Modi, dass die Abdeckung an gegenüberliegenden Rändern identisch ist. Fünf RNG-Ziehungen pro Zelle (Optionen verschieben die Anordnung nicht). Schutz gegen Links mit Riesenwerten: Zellgrösse mindestens 8 px, höchstens 2000 Elemente pro Kachel. SVG: ein `<pattern patternUnits="userSpaceOnUse">` mit `<use>` auf einen Pfad in `defs`, nach Farbe gruppiert. Uploads werden einmal als `<image>` in `defs` eingebettet; einfarbig färbt bei Rasterbildern ein Filter (`feFlood` + `feComposite` mit der Alpha-Maske), bei SVG eine umgefärbte Kopie pro Farbe (Sanitizer-Option `recolor`, zusammen höchstens 2 MB). Exporte: SVG, CSS (die Kachel als data-URI mit `background-size` und `background-repeat: repeat`), PNG-Kachel (eigene Grösse, nur Skalierung 1×/2×/4×), PNG/JPG/WebP-Fläche. Generisch über `ToolDefinition.tile` (Kachel-Renderer), der Export-Dialog zeigt die PNG-Kachel bei jedem Tool mit `tile`. Uploads: SVG, PNG, JPG, WebP bis 5 MB (GIF nicht, nur ein Bild), Typ per Magic Bytes, Zuschnitt frei oder quadratisch per Maus oder Tastatur; Rasterbilder werden im Worker zugeschnitten und auf höchstens 1024 px Kantenlänge neu kodiert (PNG, JPEG bei JPEG-Quelle), SVG über den Sanitizer (neue viewBox, Abschnitt Sicherheit in `docs/ARCHITECTURE.md`). Uploads bleiben im Browser, nicht im Teilen-Link (`localParams`) und bleiben beim Wechsel der Vorlage erhalten. 7 Presets (Wiese, Herzklopfen, Terrazzo, Sternenlicht, Botanisch, Bauhaus, Wellen), Gating frei bis M4.

### A3. Polka Dots, Grid Patterns, Confetti, Starry Sky, Dieter Dots · M2/M3 · G
- Einfache SVG-Generatoren mit wenigen Parametern (Dichte, Grösse, Varianz, Farbe, Form). Dieter Dots: konzentrische Ringe aus Punkten (`rings`, `dotsPerRing`, `ringSpacing`, `scale`).
- Confetti/Starry Sky: Poisson-Disk-Sampling (Bridson) für gleichmässige, natürliche Verteilung.
- **Polka Dots umgesetzt in M1** (ROADMAP gilt): `layout` (Raster, versetzt, verstreut per Poisson-Disk), `shape` (Kreis, Ring, Quadrat), `colorMode` (eine Farbe, abwechselnd, zufällig), `spacing` in Prozent der kürzeren Kante (Aussehen bleibt beim Ändern der Grösse gleich), `size`, `sizeVariance`, `jitter`. Schutz vor extremen Formaten: Abstand mindestens 4 px und höchstens 10 000 Punkte pro Render (der Abstand wird bei Bedarf gleichmässig vergrössert). Exporte: SVG, CSS, PNG, JPG, WebP.
- **Grid Patterns umgesetzt in M2**: `style` (Linien, Punkte, Kreuze, Kacheln), `cellSize` in Prozent der kürzeren Kante, `weight` (Strichstärke, Punktradius bzw. Kachelfuge relativ zur Zelle), `lineStyle` (durchgezogen, gestrichelt, gepunktet; nur bei Linien, Striche auf die Kreuzungen ausgerichtet), `majorEvery` (jede n-te Linie bzw. jeder n-te Punkt dicker in der zweiten Palettenfarbe, 0 = aus), `fade` (aus, radial zur Mitte, an den Rändern; per SVG-Maske, Hintergrund bleibt unberührt). Raster auf die Bildmitte zentriert, ohne Zufall (Seed ohne Wirkung). Schutz wie Polka Dots: Zelle mindestens 4 px, höchstens 10 000 Rasterpunkte. Exporte: SVG, CSS, PNG, JPG, WebP.
- **Confetti umgesetzt in M2**: `shape` (gemischt, Streifen, Kreis, Dreieck, Kringel), `spacing` (Mindestabstand per Poisson-Disk in Prozent der kürzeren Kante), `size`, `sizeVariance`, `rotation` (maximale Zufallsdrehung in Grad). Farbe pro Stück zufällig aus der Palette. Formen als Pfade mit vorgerechneten Koordinaten (keine Transformationen), nach Farbe gruppiert. Schutz wie Polka Dots (verstreut): Abstand mindestens 4 px, höchstens 10 000 Stück. Exporte: SVG, CSS, PNG, JPG, WebP.
- **Starry Sky umgesetzt in M2**: `palette` als Himmelsverlauf von oben nach unten (kein `background`), `starColor`, `density` (Sternabstand per Poisson-Disk in Prozent der kürzeren Kante), `size` (grösster Stern relativ zum Abstand, kleine Sterne häufiger), `twinkle` (Helligkeitsvariation, in Zehnerstufen gruppiert), `glow` (radiale Verläufe um grössere Sterne), `sparkles` (0 bis 24 vierzackige Glanzsterne aus eigenem Zufallsstrom, damit die übrigen Sterne stabil bleiben). Schutz: Abstand mindestens 4 px, höchstens 10 000 Sterne (plus Leuchtkreise nur um die grösseren). Exporte: SVG, CSS, PNG, JPG, WebP.
- **Dieter Dots umgesetzt in M2**: `rings` (1 bis 40), `dotsPerRing` (Punkte im ersten Ring; Ring i hat i-mal so viele, damit der Abstand entlang der Ringe gleich bleibt), `ringSpacing` in Prozent der kürzeren Kante, `scale` (Punktdurchmesser relativ zum Ringabstand), zusätzlich `falloff` (Punkte werden nach aussen kleiner), `twist` (Drehung pro Ring in Grad, ergibt Spiralen) und `colorMode` (eine Farbe, pro Ring abwechselnd, Verlauf aus der Palette). Mittelpunkt in der Bildmitte, ohne Zufall. Schutz: Ringabstand mindestens 4 px, Ringe ausserhalb des Bildes entfallen, höchstens 10 000 Punkte (äussere Ringe werden weggelassen). Exporte: SVG, CSS, PNG, JPG, WebP.

### A4. Doodle Backgrounds · M3 · G
- Handgezeichnet wirkende Formen: Linien/Pfade mit leichtem Rauschen (Perlin-Offset der Kontrollpunkte), runde Linienenden, Verteilung per Poisson-Disk.
- **Umsetzung M3** (Tool-ID `doodles`): acht eigene, prozedurale Strichformen (Kringel, Zickzack, Spirale, Kreis mit Überschwung, Dreieck, Stern, Kreuz, Bogen) als Polylinien in Einheitskoordinaten; jeder Punkt wird mit 1D-Gradientenrauschen (Perlin-Konstruktion, `noise.ts`) entlang der Strichlänge verschoben (`wobble`), danach Catmull-Rom-Glättung (eckige Formen mit tiefer Spannung). Params `shape` (gemischt oder eine Form), `spacing` (Poisson-Disk in Prozent der kürzeren Kante), `size`, `sizeVariance`, `rotation`, `wobble`, `strokeWidth` (px). Ein Rauschpaar pro Render, pro Doodle nur eine Phase (fünf RNG-Ziehungen pro Position, damit Optionen die Anordnung nicht verschieben). Alle Striche einer Farbe in einem Pfad mit runden Enden. Schutz: Abstand mindestens 8 px, höchstens 2500 Doodles. Exporte: SVG, CSS, PNG, JPG, WebP.

## B. CSS-Patterns

### B1. CSS Pattern Library + Editor · M2 · G
- **Bibliothek**: Kategorien Dots, Grid, Stripes, Waves, Geometric (Chevron, Diamond, Checkerboard, Zigzag). Jedes Pattern ist eine Funktion `(colors, size, angle, opacity) => string` mit reinem CSS (`radial-gradient`, `linear-gradient`, `conic-gradient`, `repeating-*`).
- **Editor**: mehrere Pattern-Ebenen stapeln (CSS erlaubt mehrere `background-image`), pro Ebene Farbe, Grösse, Rotation (via `background` auf Pseudo-Element oder SVG-Fallback), Opazität.
- **Exporte**: CSS-Snippet, Tailwind-Arbitrary-Value, SVG-Fallback, PNG.
- SEO-Magnet: Jedes Pattern bekommt eine eigene indexierbare Detailseite.
- **Bibliothek umgesetzt in M2 (M2-AP03, Tool-ID `css-patterns`)**: 34 eigene Muster (Clean-Room) in fünf Kategorien: Punkte 6, Raster 6, Streifen 7, Wellen 6, Geometrisch 9 (`packages/engine/src/tools/css-patterns/`). Jedes Muster ist eine reine Funktion `(size, angle) => PatternLayer[]`; eine Ebene ist ein CSS-Verlauf (linear, radial, konisch, je auch repeating) mit Kachelgrösse (`background-size`) und Versatz (`background-position`) oder über das ganze Element. Farben (`color`, `accent`, `background`) und `opacity` kommen erst beim Zeichnen dazu, die Muster nennen nur die Tinte ("a", "b", transparent). Drehbar (`angle`) sind nur Muster aus Verläufen über das ganze Element (Streifen, Rasterlinien, Millimeterpapier); gedrehte Kacheln hätten Nähte, deshalb ist der Winkel dort ausgeblendet.
  - **Datenmodell der Ebenen (M2-AP04)**: eine Muster-Instanz ist `{ pattern, color, accent, size, angle, opacity }`. Stapeln heisst: die Ebenenlisten der Instanzen (oberste zuerst, jede mit ihren eigenen Farben, `PaintedLayers`) aneinanderhängen, über einem gemeinsamen Hintergrund (`cssPatternStack`, `stackDeclarations`, `stackSvg`). Die Einzelmuster-Funktionen sind ein Stapel aus einer Instanz. Ein leerer Stapel (alle Ebenen ausgeblendet) zeichnet nur den Hintergrund (`background-image: none`).
  - **Ein Render-Pfad**: dieselbe Ebenenliste ergibt die CSS-Deklarationen (Vorschau im Editor und auf den Seiten ist echtes CSS), die Tailwind-Klassen (Arbitrary Properties) und ein SVG für SVG-, PNG-, JPG- und WebP-Export. Das SVG zeichnet dieselbe Geometrie ohne `foreignObject`: lineare und radiale Verläufe mit exakt berechneter CSS-Verlaufslinie (`spreadMethod="repeat"` für die repeating-Varianten), Kacheln als `<pattern>`, konische Verläufe nur mit harten Sektoren und als Polygone. Durchsichtige Stopps übernehmen die Nachbarfarbe mit Alpha 0, damit SVG ohne vormultipliziertes Alpha gleich überblendet. Ein E2E-Test vergleicht CSS und SVG aller Muster pixelweise (Chromium, unter 1 % abweichende Pixel; gemessen liegt alles bei Kantenglättung einzelner Pixel).
  - **Grenzen des SVG-Exports**: Kantenglättung kann an einzelnen Pixeln abweichen; bei verkleinerter Darstellung (Zoom unter 100 %) zeigen Browser an Kachelkanten mit harten Stopps teils Haarlinien, im Export in Originalgrösse nicht. Weiche konische Verläufe sind im Modell bewusst nicht vorgesehen. PNG ist der verlässliche Rasterexport.
  - **Sicherheit**: Farben nur als Hex (`colorSchema`), Muster nur als Enum der Bibliothek, Zahlen begrenzt; die Engine prüft Farben ein zweites Mal. Präparierte Teilen-Links mit CSS in einer Farbe werden als `invalid-params` abgewiesen (Test).
  - **Seiten**: Übersicht mit Kategorie-Filter unter `/de/css-muster` und `/en/css-patterns`, pro Muster eine statische Seite (`/de/css-muster/<slug>`) mit Live-Vorschau (Inline-Style, CSP-konform), CSS und Tailwind zum Kopieren, Link in den Editor (`#d=`), ähnlichen Mustern, Breadcrumb-JSON-LD, hreflang, Sitemap-Eintrag und eigenem OG-Bild (Build-Skript, doppelte Mustergrösse). Slugs in `PATTERN_SLUGS` (`apps/web/i18n/slugs.ts`) mit Vertragstest.
  - **Editor mit Ebenen (M2-AP04)**: Params `{ background, layers }`, `layers` ist ein Zod-Array von Ebenen `{ pattern, color, accent, size, angle, opacity, visible }` mit 1 bis 5 Einträgen (`CSS_PATTERN_STACK_MAX`), oberste Ebene zuerst wie in CSS. Ausgeblendete Ebenen bleiben in der Liste, werden aber weder in der Vorschau noch in einem Export gezeichnet.
    - Die Editor-Shell kennt keine Muster: die Ebenenliste ist das generische Listen-Control (`kind: "list"`, `ListHint` mit `visibilityField: "visible"`, `titleField: "pattern"`, `newItem`, `itemLabelKey`), siehe `docs/ARCHITECTURE.md` Abschnitt 4. Hinzufügen setzt eine neue Ebene oben ein (erstes noch nicht benutztes Muster, Farben der obersten Ebene, Deckkraft 60 %).
    - Muster-Auswahl als generischer Thumbnail-Picker (`kind: "thumbnails"` mit `optionPreview`): Raster mit Radiogruppe, ein Tab-Stopp, Pfeiltasten, Pos1/Ende, jede Kachel mit dem Musternamen beschriftet. Die Vorschau ist eine kleine CSS-Deklaration (Muster in den Farben der Ebene über dem Hintergrund, Periode höchstens 20 px), erzeugt erst, wenn die Kachel sichtbar wird (IntersectionObserver). Kein Canvas, kein Worker nötig: pro Kachel unter 1 ms.
    - **Leertaste** würfelt alle Ebenen neu (Muster, Grösse, Winkel, Deckkraft, Farben aus einer gemeinsamen Zufallspalette), Anzahl und Sichtbarkeit bleiben. Begründung: "Neue Variante" gilt in jedem Tool für das ganze Motiv, die Auswahl einer Ebene ist reiner UI-Zustand (nicht im Store, nicht im Link), und nur so passen die Farben der Ebenen zueinander. Wer eine Ebene behalten will, sperrt ihre Felder (Schloss pro Feld und Ebene) oder mit dem Schloss bei "Ebenen" den ganzen Stapel. Die Zufallsfolge ist unabhängig von Sperren gleich lang, gesperrte Felder ändern also nichts an den anderen.
    - **Alte Links**: Einzelmuster-Params aus AP03 (`{ background, pattern, color, accent, size, angle, opacity }`) hebt `migrateParams` vor der Schema-Prüfung auf einen Stapel aus einer Ebene; Musterseiten erzeugen jetzt Links im neuen Format. Getestet in `tools.test.ts`, `share-codec.test.ts`, `apps/web/lib/css-patterns.test.ts` und E2E.
    - **Teilen-Link**: ein Design mit 5 Ebenen und maximal langen Zahlen ergibt 388 Zeichen (Grenze 8192), Test in `share-codec.test.ts`. Eine sechste Ebene, eine leere Liste oder CSS in einem Feld ergeben `invalid-params`.
    - **Exporte**: CSS, Tailwind, SVG, PNG, JPG und WebP enthalten alle sichtbaren Ebenen aus demselben Stapel (ein Render-Pfad). E2E vergleicht Vorschau und PNG-Export pixelweise für die Standardwerte und die Vorlage "Highland" (3 Ebenen, teils durchscheinend).
    - **Vorlagen**: alle 7 Vorlagen haben 2 bis 3 Ebenen (Snapshot pro Vorlage mit `seed = 1`).
    - Ziehen zum Umsortieren ist nicht umgesetzt (optional); Umsortieren geht mit den Buttons und mit Alt + Pfeil.

### B2. CSS Gradient Generator · M1 · G
- Linear, radial, conic; Farbstopps mit Drag; **Easing** der Übergänge (Zwischenstopps entlang Easing-Kurve, um Banding zu vermeiden); Interpolation in OKLCH (`in oklch` Syntax mit Fallback).
- Exporte: CSS, Tailwind, SVG, PNG. Teilen per Link.
- **Umsetzung M1**: Farbstopps gleichmässig verteilt aus der Palette (Drag-Stopps brauchen ein eigenes Control, später). Kein `background`-Parameter, der Verlauf deckt immer alles ab. CSS mit sRGB-Fallback (Zwischenstopps in OKLCH vorberechnet) plus zweiter Deklaration mit `in oklch`/`in oklab`. SVG-Vorschau exakt für linear und radial, konisch als Keile angenähert (SVG kennt keine konischen Verläufe). Tailwind-Export (Arbitrary Value) als Zusatzausgabe im Export-Dialog umgesetzt.

## C. Gradients

### C1. Mesh Gradients · M3 · G/P
- **Parameter**: Palette (Drag-to-reorder), `points` (3 bis 8), `blur`, `warp`, `grain`, `seed`.
- **Algorithmus (SVG)**: farbige Ellipsen/Pfade an PRNG-Positionen, `feGaussianBlur` für weiche Übergänge, optional `feTurbulence` + `feDisplacementMap` für "Flüssig"-Verzerrung, Grain als zusätzliche `feTurbulence`-Ebene mit Blend-Mode. **Illustrator-Kompatibilität testen**, zusätzlich Raster-Export.
- Später (P2): Animation (Punkte auf Lissajous-Bahnen) ► Video.
- **Umgesetzt in M3 (M3-AP07, Tool-ID `mesh-gradient`)**: `background`, `palette` (Farbe i für Fläche i, zyklisch), `points` (3 bis 8 Farbflächen), `blur` (Gauss bis 20 % der kürzeren Kante), `warp` (Verzerrung der Umrisse), `grain`. Mittelpunkte per Best-Candidate-Sampling (gleichmässig, bis 12 % ausserhalb des Bildes), Umrisse als geschlossene Catmull-Rom-Kurven mit radialem Rauschen und gestreckter Achse. **Abweichung von der Skizze**: kein `feTurbulence`/`feDisplacementMap`, die Verzerrung steckt in der Geometrie (Turbulenz rendert je Browser anders), Körnung als Gauss-Kachel statt `feTurbulence`. Ein `feGaussianBlur` mit `color-interpolation-filters="sRGB"` und Filterregion 3σ über den Rand (kein Ausbleichen an den Kanten). Gleich viele Zufallszahlen pro Fläche, Unschärfe und Verzerrung verschieben also nichts. Exporte: PNG, JPG, WebP, SVG, CSS. Illustrator ungetestet (SVG-Filter), PNG ist der verlässliche Export.

### C2. Blurry Gradients · M3 · G
- 2 bis 5 Kreise, Positionierung an Ecken/Mitte, Opazität, starker Blur, Grain. SVG + PNG.
- **Umgesetzt in M3 (M3-AP07, Tool-ID `blurry-gradient`)**: `circles` (2 bis 5), `layout` (Ecken, Mitte und Ecken, Mitte), `size` (Radius in Prozent der kürzeren Kante), `spread` (zufälliger Versatz zur Bildmitte hin), `opacity`, `blur` (Gauss bis 25 % der kürzeren Kante), `grain`. Ohne SVG-Filter: jeder Kreis ist ein radialer Verlauf, dessen Stopps (21, zum Rand hin dichter) dem exakten Profil einer mit einer Gaussglocke gefalteten Kreisscheibe folgen (Bessel-Integral, Simpson). Läuft in jedem Browser und Editor gleich und kostet bei 8K nichts. Exporte: PNG, JPG, WebP, SVG, CSS.

### C3. Striped Gradients · M3 · G
- Vertikale Bänder, jedes Band mit eigenem linearen Verlauf aus der Palette, leichter Versatz. SVG/PNG.
- **Umgesetzt in M3 (M3-AP07, Tool-ID `striped-gradient`)**: `palette` (Stopps von oben nach unten), `stripes` (2 bis 40), `variance` (Breitenvariation), `offset` (zufällige Höhenverschiebung je Band, der Verlauf ist um den Versatz länger, damit nie eine einfarbige Kante entsteht), `alternate` (jedes zweite Band umgekehrt), `shading` (Licht links, Schatten rechts je Band, wie Riffelglas), `grain`. Nur Rechtecke mit linearen Verläufen; Bänder überlappen um 1 px gegen Haarlinien. Exporte: PNG, JPG, WebP, SVG, CSS.
- **Körnung der Verlaufs-Tools (C1 bis C3)**: dieselbe Gauss-Kachel wie Noise/Grain (E1), hier 128 px, monochrom, `overlay`, Deckkraft = `grain` in Prozent, aus eigenem Zufallsstrom (`deriveSeed(seed, "grain")`), damit sie die Geometrie nicht verschiebt. "Neue Variante" behält die Körnung.

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
- **Umsetzung M1**: `fillStyle` Farbe, Kontur oder Verlauf (Bild und Pattern folgen mit A1/A2). Radius-Abweichung max. 60 % bei `randomness = 1`; Catmull-Rom-Spannung so gewählt, dass die Punkte ohne Zufall einen Kreis ergeben. `clip-path: path()`-Bonus als Zusatzausgabe im Export-Dialog umgesetzt (px-Einheiten, Element in Canvas-Grösse).

### D2. Blob Composition · M3 · G/P
- Mehrere Blobs als Ebenen, Positionen an Ecken/Rändern, Brand-Farben, "Magic Resize" (Positionen relativ in % gespeichert).
- **Umsetzung M3** (Tool-ID `blob-composition`): Blobs als Listen-Param (`kind: "list"`, 1 bis 8 Ebenen, oberste zuerst) mit `anchor` (neun Positionen: Ecken, Ränder, Mitte), `offsetX`/`offsetY` in Prozent von Breite bzw. Höhe, `size` in Prozent der kürzeren Kante, `complexity`, `randomness`, `variant` (bestimmt den Umriss, unabhängig von Seed und Listenposition), `opacity`, `visible`. Form aus der Blob-Engine (D1). Farben der Reihe nach aus der Palette (Brand-Paletten folgen mit M3-AP06), Füllung Farbe, Kontur oder Verlauf (Farbe i nach i + 1). "Hinzufügen" setzt den Blob in die erste freie Ecke. Gating vorerst frei (bis M4). Exporte: SVG, CSS, PNG, JPG, WebP.

### D3. SVG Waves · M1 · G
- Layers 1 bis 5, Punkte pro Welle, Amplitude, Glättung, Richtung (oben/unten), Farbverlauf über Layers. Spline wie bei Blobs, aber offen. Exporte: SVG, PNG, CSS.
- **Umsetzung M1**: zusätzlich `coverage` (Anteil der Fläche, den die Wellen belegen). Layer-Farben werden in OKLCH entlang der Palette verteilt. Standardgrösse 1920 × 1080.

### D4. 3D Perspective Grid · M5 · G
- Retro-Synthwave-Grid: Linien in Perspektive (einfache 3D-Projektion ohne three.js möglich), Horizont, Glow (Blur-Ebene), Nebel (Verlauf), Sonne optional, Animation (Grid fährt nach vorne) für Video.

### D5. SVG Charts (Platzhalter-Charts) · M3 · G
- Linien- und Balken-Diagramme mit Zufallsdaten für Mockups. Glättung, Achsen ein/aus, Farben.
- **Umsetzung M3** (Tool-ID `svg-charts`): `type` (Linie, Fläche, gruppierte Balken), `series` (1 bis 4), `points` (2 bis 24), Daten als geseedeter Random Walk mit `trend` und `volatility` (es werden immer 4 × 24 Werte gezogen, Stiländerungen behalten die Daten), `smoothing` (Catmull-Rom), `lineWidth`, `markers`, `barGap`, `barRadius`, `axes`, `grid`, `axisColor`, `margin`. Bewusst ohne Text (keine Schriften, überall gleiche Darstellung). Leertaste würfelt Daten, Trend und Farben, der Stil bleibt. Exporte: SVG, CSS, PNG, JPG, WebP.

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

**E1 in M2 umgesetzt (M2-AP02, Tool-ID `noise-grain`)**: eigenständige Grain-Textur ohne Bild-Upload (der kommt mit den Bildeffekten).
- Grundfläche `base`: Farbe, linearer oder radialer Verlauf (2 bis 3 Stopps, `palette`, `angle`) oder transparent (reine Grain-Ebene als PNG/WebP).
- Parameter `amount` (0 bis 100 %, Deckkraft der Grain-Ebene), `size` (1 bis 8 px), `blend` (overlay, soft-light, multiply), `mono`.
- Algorithmus: nahtlose Kachel von 256 × 256 px mit Gauss-Rauschen aus dem Seed (`grainTile` in `packages/engine`). Bei `size` > 1 ein periodisches Gitter aus Gauss-Werten, bilinear interpoliert und pro Pixel auf Varianz 1 normiert. Neutralwert 128 für overlay/soft-light, 255 für multiply (dunkelt nur ab).
- Render-Art `svg`: Die Kachel steckt als PNG-data-URI (eigener PNG-Encoder ohne Kompression, Graustufen bei mono, sonst RGB) in einem `<pattern>`, gemischt per `mix-blend-mode`, skaliert mit `image-rendering: pixelated`. Kein `feTurbulence`, weil das kein Gauss-Rauschen ist und die Browser es nicht pixelgleich rendern. So bleiben Vorschau und Export identisch.
- Aufwand pro Render ist durch die Kachelgrösse begrenzt, unabhängig von Canvas-Grösse und Params (getestet mit 8192 × 8192 und 8192 × 16). Die Kachel wird pro (Seed, size, mono, blend) zwischengespeichert, Farb- und Stärke-Änderungen sind sofort da.
- Exporte: PNG, JPG, WebP, SVG, CSS (SVG als data-URI, ca. 90 KB mono bzw. 260 KB farbig).
- Später (Bildeffekte): dieselbe Kachel per Blend-Formeln auf `ImageData` im Worker in `packages/effects` anwenden.

## F. Colors

| Tool | Funktion | Phase |
|---|---|---|
| **F1 Palette Generator** | Leertaste = neue Palette, Locks, Harmonien (analog, komplementär, triadisch, split, tetradisch) in OKLCH, Kontrastanzeige (WCAG), Speichern ins Brand Kit | M2 |
| **F2 Tints & Shades** | Skala aus Basisfarbe (Mischung mit Weiss/Schwarz bzw. OKLCH-Lightness-Rampe), Export HEX/RGB/HSL/CSS-Variablen | M2 |
| **F3 Tailwind Palette** | 11 Stufen 50 bis 950, Basis auf 500 verankern, Lightness-Kurve + leichte Chroma-Reduktion an den Rändern; Export `tailwind.config.js`, `@theme`-Variablen (Tailwind v4), OKLCH, HEX | M2 |
| **F4 Palette aus Bild** | Bild clientseitig, k-Means in OKLab (oder Median Cut) im Worker, 3 bis 10 Farben, sortiert nach Anteil | M2 |

- **Umsetzung M2 (F1 bis F3)**: Farbmathematik in `packages/engine/src/palette/` (WCAG-2-Kontrast, Formate HEX/RGB/HSL/OKLCH, Harmonien, Skalen, Swatch-SVG, Code-Exporte). Die Vorschau ist ein SVG aus Farbfeldern mit Wert und Kontrast der Beschriftung (Schwarz oder Weiss, je nachdem was besser lesbar ist), daher sind Vorschau, SVG und PNG identisch. Angezeigte Kontrastwerte werden abgerundet, damit nie ein knapp verfehltes AA erscheint. Code-Exporte laufen über `extraExports`. Standardgrösse 1920 × 1080. Speichern ins Brand Kit folgt in M3.
- **F1 Palette Generator**: 2 bis 8 Farben als einzelne Parameter `color1` bis `color8`, damit jede Farbe das normale Schloss bekommt (keine Änderung an der Editor-Shell). Harmonie `auto` (zufällig pro Palette) oder fest; ein Wechsel färbt die nicht gesperrten Farben sofort neu ein, deterministisch aus dem aktuellen Seed (`regenerateOn` in der ToolDefinition). Die erste gesperrte Farbe ist Anker der Harmonie. Helligkeit läuft von hell nach dunkel (oder umgekehrt), Farbtöne folgen der Harmonie in OKLCH, Gamut-Mapping per Chroma-Reduktion. Optional Kontrastmatrix (jede Farbe auf jeder). Exporte: CSS-Variablen, HEX-Liste, SVG, PNG, JPG, WebP.
- **F2 Tints & Shades**: 0 bis 10 Aufhellungen und Abdunklungen, `range` bestimmt, wie nah die äussersten Stufen an Weiss bzw. Schwarz kommen. Methoden: OKLCH-Helligkeitsrampe (Chroma bleibt), Mischen in OKLab, Mischen in sRGB. Würfeln ändert nur die Grundfarbe. Exporte: CSS-Variablen (`--name-tint-n`, `--name`, `--name-shade-n`), HEX-, RGB-, HSL-Liste.
- **F3 Tailwind Palette**: Referenzkurve der Helligkeit (gerundete Mittelwerte bekannter UI-Paletten), gestreckt auf `lightest` (50), Grundfarbe (500, exakt) und `darkest` (950). Chroma sinkt zu den Enden um `chromaFalloff * t^1.5`, optional Farbtonverschiebung. Exporte: `tailwind.config.js`, Tailwind-v4-`@theme` (OKLCH), CSS-Variablen in OKLCH und HEX, HEX-Liste.
- **F4 Palette aus Bild (M2-AP06, Tool-ID `palette-from-image`)**: Bild per Ablage, Dateiwahl oder Einfügen (Ctrl+V) über die generische Bildeingabe der Editor-Shell (siehe ARCHITECTURE.md 4.2). Erlaubt sind PNG, JPG, WebP, GIF (erstes Bild) und SVG (nur über `<img>` gerastert) bis 5 MB und 64 Megapixel; der Typ wird an den Magic Bytes erkannt. Das Bild wird im Worker auf höchstens 256 px Kantenlänge verkleinert und nie hochgeladen, gespeichert oder in Teilen-Links übernommen. Algorithmus (`extractPalette` in `packages/engine`): Pixel auf 5 Bit pro Kanal gebinnt (höchstens 32 768 gewichtete Punkte), dann gewichtetes k-Means++ in OKLab mit dem Seed (Leertaste = neuer Start), höchstens 24 Iterationen, durchsichtige Pixel (Alpha < 128) zählen nicht. Ergebnis: 3 bis 10 Farben mit Anteil, sortiert nach Anteil, Helligkeit oder Farbton (Grautöne zuletzt). Ohne eigenes Bild dient ein prozedural gezeichnetes Beispielbild (Sonnenuntergang, keine Asset-Lizenz nötig); Standardwerte und 7 Vorlagen (Farbanzahl und Sortierung) enthalten dessen Paletten für Seed 1, ein Test rechnet sie nach. Exporte: CSS-Variablen, HEX-Liste, `tailwind.config.js`, Tailwind-v4-`@theme`, SVG, PNG, JPG, WebP.
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
