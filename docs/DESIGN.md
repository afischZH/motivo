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
│ ‹ Alle  ☆  Name des Designs   (TOOL Name ⇅)   ↶ ↷ ⌨ │ 🎲 🔗 ↗ Speichern Export│
├──────────────┬──────────────────────────────────────────┬─────────────┤
│ ▤ VORLAGEN ˄ │  «                                    »  │ ⚙ Einstel-  │
│ (Thumbnails) │      ┌──────────────────────┐            │   lungen    │
│              │      │  Motiv auf Blatt     │            │ ▣ FARBEN ˄  │
│ ⌗ LEINWAND-  │      │  (Punktraster)       │            │ ▦ FORM ˅    │
│   GRÖSSE ˄   │      └──────────────────────┘            │ ...         │
│              │ (− 65 % + │ ⤢ 100 %)        (Im Kontext) │             │
├──────────────┴──────────────────────────────────────────┴─────────────┤
│ Varianten-Filmstreifen ◀ ▢ ▢ ▢ ▣ ▶     [Leertaste] Neue Variante      │
└───────────────────────────────────────────────────────────────────────┘
```

- **Kopfzeile** in drei Zonen: links Zurück, Favorit und der Design-Name als randloses Titelfeld mit Speicherstatus; Mitte die Tool-Pille («Tool: Name ⇅», öffnet die Befehlspalette nur mit Tools, `openToolSwitcher` in `@musterli/editor-ui/commands`); rechts leise Icon-Knöpfe (Undo, Redo, Kürzel), Neu würfeln, Teilen, Weiterverwenden, Speichern und als einzige gefüllte Aktion Exportieren. Texte von Neben-Aktionen erscheinen erst auf breiten Bildschirmen, der Name bleibt für Screenreader.
- **Seitenleisten** bestehen aus einklappbaren Abschnitten (`PanelSection`, natives `<details>`): Symbol, kleine Grossbuchstaben-Überschrift, Chevron, Trennlinie über die volle Breite. Symbole der Einstellungsgruppen kommen generisch aus der Gruppen-Id (`group-icons.tsx`, sonst Regler-Symbol). Links Vorlagen und Leinwandgrösse, rechts Einstellungen.
- **Arbeitsfläche**: Motiv auf einem Blatt (Karte mit 10 px Rand und weichem Schatten) über dem Punktraster. Schwebende Zoom-Leiste unten links (−, Anzeige, +, Einpassen, 100 %), «Im Kontext» unten rechts. Runde «/»-Knöpfe an den Rändern blenden die Seitenleisten aus (gemerkt in `localStorage` `musterli.editor.panels`).
- **Social-Editor** folgt demselben Muster: links Format, Hinzufügen, Ebenen; rechts Eigenschaften bzw. Hintergrund als Abschnitte; Exportieren öffnet ein Popover mit Dateiformat, Grösse und Herunterladen; Neu, Als Kopie speichern und Meine Designs liegen im Menü «Weitere Aktionen».
- **Tablet (768 bis 1023 px)**: Presets als einklappbare Leiste oben, Parameter als rechtes Sheet.
- **Mobile (< 768 px)**: Vorschau oben (Seitenverhältnis), Parameter als Bottom-Sheet mit Tabs (Presets · Farben · Form · Export), grosser "Neu würfeln"-Button statt Leertaste. Video-Export und Social-Editor auf Mobile nur lesend bzw. "auf Desktop fortsetzen".

## 3. Controls (aus dem Zod-Schema generiert)

| Schema-Typ | Control | Details |
|---|---|---|
| `number` mit min/max | Slider + Zahlenfeld | Shift = 10er-Schritte, Doppelklick = Default |
| `enum` (≤ 5) | Segmented Control | sonst Select |
| `boolean` | Switch | |
| Farbe | Swatch + Popover-Picker: eigene Fläche für Sättigung/Helligkeit und Farbton-Regler (in jedem Browser gleich, per Pfeiltasten bedienbar, Shift = 10 %), HEX-Feld mit Pipette in einer Input Group (EyeDropper-API wo verfügbar), Brand-Farben | Tints/Shades-Leiste unter dem Picker |
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
| `⌘/Ctrl + K` | Befehlspalette (überall: Tools, Seiten, Aufgaben, Hell/Dunkel; im Editor zusätzlich Export, Variante, Speichern, Kopieren, Teilen, Brand-Palette, Undo/Redo, Kürzel) |
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
- **Hinweise statt `title`**: Icon-Knöpfe im Editor zeigen einen gestalteten Hinweis (`Hint`, Radix Tooltip) bei Hover und Tastaturfokus, mit Tastenkürzel als Tastenkappen (`Kbd`, ⌘ auf Apple-Geräten, sonst Ctrl). Nach dem ersten Hinweis erscheinen die nächsten sofort.
- **Inspector im Editor**: kompakte Einstellungen als Zeile (Label links, Control rechts) für Slider, Zahl, Auswahl, Farbe und Schalter; breite Controls (Segmente, Paletten, Listen, Kacheln) bleiben gestapelt. Zahlenfelder lassen sich mit der Maus seitwärts ziehen (Shift = 10er-Schritte), ein Klick fokussiert zum Tippen.

## 6. Wichtige Screens

1. **Startseite**: Hero mit live laufendem Shader-Hintergrund (gerendert mit dem eigenen Tool, Dogfooding), Tool-Raster nach Kategorien, "So funktioniert's" in 3 Schritten, Testimonials (erst wenn echte vorhanden), Hinweis "Getragen von Spenden" mit Link zur Seite "Unterstützen" (keine Preise).
2. **Tool-Landingpage (SEO)**: H1 "XYZ-Generator", grosser Button "Jetzt öffnen", eingebettete Mini-Vorschau mit 3 Presets zum Durchklicken, Feature-Blöcke, "Was ist ...", Anleitung, Anwendungsfälle, FAQ, verwandte Tools.
3. **Katalog**: Filter-Chips (Kategorien, Gratis, Neu), Suche, Karten mit animiertem Hover-Preview. Umgesetzt: Sofortsuche (filtert beim Tippen über Name, Beschreibung und Kategorien, ohne Rücksicht auf Akzente; `/` fokussiert, `Esc` leert; leerer Zustand mit "Suche zurücksetzen"), die zusammen mit den Kategorie-Sprunglinks unter dem Header mitläuft, auf Mobile als wischbare Zeile. Alle Karten stehen im Server-HTML, die Suche blendet nur aus.
4. **Meine Designs** (lokal im Browser, ohne Konto): Raster gespeicherter Designs mit Thumbnails, Ordner links, Suche, Filter nach Tool, Mehrfachauswahl (Verschieben, Löschen, Duplizieren). Leerer Zustand: "Dein erstes Motiv in 10 Sekunden" mit 4 Schnellstart-Tools.
5. **Brand Kit**: Paletten, Logos, eigene Shapes/Packs, Fonts; "Aus Website importieren" (P2).
6. **Export-Dialog**: Formatwahl als Karten (Bild · Vektor · Code · Animation), Grösse als 1×/2×/4× des Designs oder "Eigene Grösse" plus Auswahlfeld "Gängige Grösse" (derselbe gruppierte Katalog wie der Grössen-Wähler, Tool-Grössen zuoberst; die Wahl setzt "Eigene Grösse" mit Breite und Höhe der Vorlage, bei anderem Seitenverhältnis wird das Motiv in dieser Grösse neu berechnet), Qualität, Transparenz, Dateiname, Vorschau der Dateigrösse; Code-Formate mit Copy-Button und Syntax-Highlighting.
7. **Unterstützen** (`/de/unterstuetzen`, `/en/support`, seit M3-AP14): kurzer, ehrlicher Text (gratis, ohne Konto, ohne Tracking, Exporte frei nutzbar), wofür Spenden gebraucht werden (Domain, Hosting, Weiterentwicklung), hervorgehobener Block mit Knopf "Jetzt spenden" zum externen Anbieter. Ohne konfigurierten Link (`NEXT_PUBLIC_DONATION_URL`) neutraler Hinweis "Spenden-Link folgt bald", kein toter Knopf. Dezente Hinweise nur im Footer ("Musterli unterstützen") und als eine leise Zeile im Export-Dialog nach erfolgreichem Export (öffnet in neuem Tab, damit das Design im Editor bleibt). Nie ein Popup, nie eine Sperre, nie ein Wasserzeichen.
8. **Basiselemente** (`apps/web/components/ui/`): Knopf, Badge und Feld im shadcn-Stil Maia (Pillenform, Zweitknöpfe leicht gefüllt, Felder rund mit leichter Füllung); Karten behalten ihren eigenen Radius.
9. **Kopfzeile** (alle Seiten): klebt oben, halbtransparent mit Unschärfe. Ab 1024 px eine Pillen-Leiste (aktueller Bereich mit `aria-current="page"` und heller Pille), rechts "Unterstützen" und Theme-Knopf. Darunter ein Seitenmenü (Sheet, Radix Dialog) mit Icons und Link "Musterli unterstützen"; `Esc` schliesst und gibt den Fokus zurück, schliesst auch bei Navigation. Die Desktop-Links bleiben in jeder Breite im HTML (crawlbar).
10. **Fusszeile**: Logo, Claim und Spendenlink, drei Spalten (Musterli, Sammlungen, Rechtliches), darunter Copyright und Sprachwahl.

11. **Befehlspalette** (seit W1-AP01): Knopf "Suchen ⌘K" in der Kopfzeile (auf Mobile nur Lupe), Dialog oben mittig. Combobox mit Listbox nach WAI-ARIA APG: Fokus bleibt im Eingabefeld, Pfeiltasten bewegen die aktive Option, Enter öffnet, Esc schliesst und gibt den Fokus zurück. Gruppen ohne Suche: Aktionen, Favoriten, Zuletzt benutzt, Seiten, Tools; beim Suchen Aktionen, Tools, Seiten (Tools zuerst nach Treffer im Namen). Die englische Tool-Id ist mit durchsuchbar ("flow field" findet das Tool auch auf Deutsch).
12. **Favoriten und Zuletzt benutzt** (W1-AP03): Stern-Knopf (`aria-pressed`) auf jeder Tool-Karte und im Editor-Kopf; im Katalog oben "Deine Tools" mit Favoriten und den letzten 6 Tools (ohne Wiederholung), nur wenn etwas gespeichert ist. Nur im Browser (localStorage).
13. **Im Kontext** (W1-AP02): Umschalter in der Vorschau-Leiste für Tools mit Hintergrund-Kategorie. Legt eine Muster-Website (Marke, Navigation, Titel, Text, Knopf) über das Motiv, Textfarbe Auto/Dunkel/Hell, daneben "Kontrast 8.6:1 · AAA" nach WCAG 2, gemessen auf 95 % der Fläche unter dem Text.
14. **Aufgabenseiten** (W1-AP04): Chips "Nach Aufgabe" oben im Katalog, je eine Seite mit Seitenkopf, Tool-Karten und Links zu den anderen Aufgaben.

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
