# DESIGN.md: UI/UX-Richtlinien

## 1. Gestaltungsgrundsätze

1. **Das Motiv ist der Star.** Die UI ist ruhig, neutral und tritt zurück. Keine bunten Buttons, die mit dem generierten Bild konkurrieren.
2. **Erst Ergebnis, dann Einstellungen.** Jedes Tool startet mit einem schönen Preset, nie mit einer leeren Fläche.
3. **Spielerisch erkunden.** Leertaste = neue Variante. Zurück/Vor ist immer möglich (Verlauf der letzten Varianten als Filmstreifen).
4. **Ein Klick zum Export.** Primärer Button "Exportieren" immer sichtbar; häufigstes Format als Default merken.
5. **Gleiches Muster in jedem Tool.** Wer ein Tool kann, kann alle.

## 2. Editor-Layout (Desktop ≥ 1024 px)

```
┌───────────────────────────────────────────────────────────────────────┐
│ Logo · Tool-Wechsler (⌘K)        Titel (editierbar)   Speichern  Export│
├──────────────┬──────────────────────────────────────────┬─────────────┤
│ Presets      │                                          │ Parameter   │
│ (Thumbnails) │            Vorschau / Canvas             │ (gruppiert, │
│              │      (Zoom, Fit, 1:1, Transparenz-       │  Akkordeon) │
│ Paletten     │       Schachbrett, Kachel-Vorschau)      │             │
│ (Brand oben) │                                          │ Locks 🔒    │
├──────────────┴──────────────────────────────────────────┴─────────────┤
│ Varianten-Filmstreifen ◀ ▢ ▢ ▢ ▣ ▶     [Leertaste] Neue Variante      │
└───────────────────────────────────────────────────────────────────────┘
```

- **Tablet (768 bis 1023 px)**: Presets als einklappbare Leiste oben, Parameter als rechtes Sheet.
- **Mobile (< 768 px)**: Vorschau oben (Seitenverhältnis), Parameter als Bottom-Sheet mit Tabs (Presets · Farben · Form · Export), grosser "Neu würfeln"-Button statt Leertaste. Video-Export und Social-Editor auf Mobile nur lesend bzw. "auf Desktop fortsetzen".

## 3. Controls (aus dem Zod-Schema generiert)

| Schema-Typ | Control | Details |
|---|---|---|
| `number` mit min/max | Slider + Zahlenfeld | Shift = 10er-Schritte, Doppelklick = Default |
| `enum` (≤ 5) | Segmented Control | sonst Select |
| `boolean` | Switch | |
| Farbe | Swatch + Popover-Picker (HEX, RGB, HSL, OKLCH, Pipette via EyeDropper-API wo verfügbar) | Tints/Shades-Leiste unter dem Picker |
| Palette | Reihe von Swatches, Drag-to-reorder, +/−, "Zufallspalette", Brand-Paletten oben | max. 10 |
| Shape/Pack | Grid-Picker mit Suche und Mehrfachauswahl | |
| Bild-Upload | Dropzone + Paste aus Zwischenablage + Crop-Dialog | Hinweis: "Bild bleibt auf deinem Gerät" |

Jedes Control hat ein Schloss für "beim Randomisieren behalten". Auf Geräten mit Maus erscheint das offene Schloss erst beim Überfahren oder Fokussieren der Zeile, ein gesperrtes immer (Akzentfarbe); auf Touch-Geräten sind alle sichtbar. Weicht ein Wert vom Standard ab, erscheint daneben ein Zurücksetzen-Knopf (Doppelklick auf den Slider bleibt als Abkürzung), oben im Panel setzt "Alle zurücksetzen" alles in einem Undo-Schritt zurück. Hilfetexte bis 90 Zeichen stehen unter dem Control, längere liegen hinter einem Info-Knopf neben dem Label (`aria-expanded`, per `aria-describedby` immer vorgelesen). Segment-Labels brechen um statt abgeschnitten zu werden; Zahlenfelder neben Slidern sind gleich breit, die Einheit steht im Feld. Pro-Parameter zeigen ein kleines Badge; Interaktion öffnet ein freundliches Upgrade-Popover statt das Control zu verstecken.

## 4. Tastaturkürzel

| Kürzel | Aktion |
|---|---|
| `Leertaste` | Neue Variante |
| `⌘/Ctrl + Z` / `⇧ + ⌘/Ctrl + Z` | Rückgängig / Wiederholen |
| `←` / `→` | Durch Varianten blättern |
| `⌘/Ctrl + S` | Speichern |
| `⌘/Ctrl + E` | Export-Dialog |
| `⌘/Ctrl + ⇧ + C` | Als PNG in Zwischenablage |
| `⌘/Ctrl + K` | Tool-Suche / Befehlspalette |
| `⌘/Ctrl + ⇧ + K` | Light/Dark wechseln |
| `0` / `1` | Zoom auf Fenster / 100 % |
| `?` | Kürzel-Übersicht |

Leertaste darf nie auslösen, wenn ein Textfeld fokussiert ist.

## 5. Design-Tokens

- **Farben**: neutrale Graustufen (z. B. 12-stufige Skala), **eine** Akzentfarbe für primäre Aktionen und Fokus. Alle Tokens als CSS-Variablen mit Light/Dark-Varianten; System-Theme als Default.
- **Typografie**: eine gut lesbare Sans (z. B. Inter oder Geist, Lizenz prüfen), Grössen 12/14/16/20/24/32/48, Zahlen in Slidern `tabular-nums`.
- **Radius**: 6 (Controls im Editor), 14 (Karten, Token `--radius-card`), 16 (Karten mit Vorschau, Sheets), 24 (Seitenköpfe, CTA-Flächen); Navigation, Chips und Marketing-Knöpfe als Pille (`rounded-full`).
- **Bausteine** (seit Neuauftritt 2026-10-29): shadcn/ui-Basiselemente in `apps/web/components/ui/` (Button, Badge, Card, Input, Separator, Sheet), Icons aus Lucide, Vorlagen aus freien shadcnspace-Blöcken (navbar-01, footer-01, faq-01, bento-grid-03), stark angepasst und ohne Framer Motion. Gemeinsamer Seitenkopf `components/layout/page-header.tsx` (Fläche mit Akzent-Schimmer und feinem Raster, Breadcrumbs, Badge, H1, Lead), Chips über `components/ui/chip.ts`. Lizenzen in `assets/LICENSES.md`.
- **Abstände**: 4er-Raster.
- **Bewegung**: 150 bis 250 ms, `ease-out`; `prefers-reduced-motion` respektieren (keine Animation der Vorschau ohne Interaktion).
- **Vorschau-Hintergrund**: Editor-Bühne `--stage` mit feinem Punktraster (`--stage-dot`), hell ein ruhiges Grau, dunkel fast Schwarz; Schachbrett nur wenn Transparenz aktiv. Thumbnails behalten `--canvas`.
- **Werkbank-Look (seit 2026-10-29)**: Startseiten-Hero, Seitenköpfe (`PageHeader`) und der Abschluss der Startseite sind in beiden Themes dunkel (Klasse `dark` am Abschnitt, semantische Tokens lösen pro Abschnitt auf), mit Punktraster und einem Akzentschimmer. Keine Etiketten über Überschriften; Zählungen stehen nach dem Lead.
- **Inspector im Editor**: kompakte Einstellungen als Zeile (Label links, Control rechts) für Slider, Zahl, Auswahl, Farbe und Schalter; breite Controls (Segmente, Paletten, Listen, Kacheln) bleiben gestapelt. Zahlenfelder lassen sich mit der Maus seitwärts ziehen (Shift = 10er-Schritte), ein Klick fokussiert zum Tippen.

## 6. Wichtige Screens

1. **Startseite**: Hero mit live laufendem Shader-Hintergrund (gerendert mit dem eigenen Tool, Dogfooding), Tool-Raster nach Kategorien, "So funktioniert's" in 3 Schritten, Testimonials (erst wenn echte vorhanden), Hinweis "Getragen von Spenden" mit Link zur Seite "Unterstützen" (keine Preise).
2. **Tool-Landingpage (SEO)**: H1 "XYZ-Generator", grosser Button "Jetzt öffnen", eingebettete Mini-Vorschau mit 3 Presets zum Durchklicken, Feature-Blöcke, "Was ist ...", Anleitung, Anwendungsfälle, FAQ, verwandte Tools.
3. **Katalog**: Filter-Chips (Kategorien, Gratis, Neu), Suche, Karten mit animiertem Hover-Preview. Umgesetzt: Sofortsuche (filtert beim Tippen über Name, Beschreibung und Kategorien, ohne Rücksicht auf Akzente; `/` fokussiert, `Esc` leert; leerer Zustand mit "Suche zurücksetzen"), die zusammen mit den Kategorie-Sprunglinks unter dem Header mitläuft, auf Mobile als wischbare Zeile. Alle Karten stehen im Server-HTML, die Suche blendet nur aus.
4. **Meine Designs** (lokal im Browser, ohne Konto): Raster gespeicherter Designs mit Thumbnails, Ordner links, Suche, Filter nach Tool, Mehrfachauswahl (Verschieben, Löschen, Duplizieren). Leerer Zustand: "Dein erstes Motiv in 10 Sekunden" mit 4 Schnellstart-Tools.
5. **Brand Kit**: Paletten, Logos, eigene Shapes/Packs, Fonts; "Aus Website importieren" (P2).
6. **Export-Dialog**: Formatwahl als Karten (Bild · Vektor · Code · Animation), Grösse als 1×/2×/4× des Designs oder "Eigene Grösse" plus Auswahlfeld "Gängige Grösse" (derselbe gruppierte Katalog wie der Grössen-Wähler, Tool-Grössen zuoberst; die Wahl setzt "Eigene Grösse" mit Breite und Höhe der Vorlage, bei anderem Seitenverhältnis wird das Motiv in dieser Grösse neu berechnet), Qualität, Transparenz, Dateiname, Vorschau der Dateigrösse; Code-Formate mit Copy-Button und Syntax-Highlighting.
7. **Unterstützen** (`/de/unterstuetzen`, `/en/support`, seit M3-AP14): kurzer, ehrlicher Text (gratis, ohne Konto, ohne Tracking, Exporte frei nutzbar), wofür Spenden gebraucht werden (Domain, Hosting, Weiterentwicklung), hervorgehobener Block mit Knopf "Jetzt spenden" zum externen Anbieter. Ohne konfigurierten Link (`NEXT_PUBLIC_DONATION_URL`) neutraler Hinweis "Spenden-Link folgt bald", kein toter Knopf. Dezente Hinweise nur im Footer ("Musterli unterstützen") und als eine leise Zeile im Export-Dialog nach erfolgreichem Export (öffnet in neuem Tab, damit das Design im Editor bleibt). Nie ein Popup, nie eine Sperre, nie ein Wasserzeichen.
8. **Kopfzeile** (alle Seiten): klebt oben, halbtransparent mit Unschärfe. Ab 1024 px eine Pillen-Leiste (aktueller Bereich mit `aria-current="page"` und heller Pille), rechts "Unterstützen" und Theme-Knopf. Darunter ein Seitenmenü (Sheet, Radix Dialog) mit Icons und Link "Musterli unterstützen"; `Esc` schliesst und gibt den Fokus zurück, schliesst auch bei Navigation. Die Desktop-Links bleiben in jeder Breite im HTML (crawlbar).
9. **Fusszeile**: Logo, Claim und Spendenlink, drei Spalten (Musterli, Sammlungen, Rechtliches), darunter Copyright und Sprachwahl.

## 7. Barrierefreiheit (WCAG 2.2 AA)

- Alle Controls per Tastatur erreichbar und beschriftet (`aria-label` aus i18n-Keys).
- Fokus-Ring sichtbar in beiden Themes.
- Kontrast UI-Text ≥ 4.5:1.
- Generierte Bilder bekommen beim Export einen vorgeschlagenen Alt-Text ("Geometrisches Muster in Blau und Orange").
- Farbpicker zeigt Kontrastwerte und warnt bei schlechter Lesbarkeit von Text auf Hintergrund (Social-Editor).

## 8. Microcopy (Ton)

- Du-Form, freundlich, kurz, leicht verspielt, nie belehrend. Beispiel: "Neu würfeln", "Gefällt dir? Speichern", "Kopiert! Ab ins Projekt damit."
- Spendenhinweise leise und ohne Druck: "Gefällt dir Musterli? Unterstütze das Projekt." Keine Schuldgefühle, keine Countdown- oder Knappheitstexte, keine Upgrade-Sprache.
- Schweizer Rechtschreibung im Deutschen (kein Eszett, immer ss).
