# ROADMAP.md: Umsetzungsplan

Annahme: 1 Person mit AI-Coding-Agent, rund 20 bis 25 Stunden pro Woche. Wochenangaben sind Richtwerte, keine Zusagen. Jeder Meilenstein endet mit einer **Definition of Done (DoD)**, die der Agent abhaken muss, bevor der nächste beginnt.

Grundentscheid 2026-10-28 (Andreas): Musterli ist komplett gratis und spendenfinanziert. Keine Konten, keine Zahlungen, keine Lizenzen, keine Credits (siehe `PRODUCT.md` Abschnitt 6).

Gesamtüberblick:

| Meilenstein | Inhalt | Wochen (ca.) | Ergebnis |
|---|---|---|---|
| **M0** | Setup & Fundament | 1 | Repo, CI, Design-System-Basis |
| **M1** | Editor-Shell + erste Tools | 2 bis 4 | 4 Tools + 6 Konverter lokal lauffähig |
| **M2** | Gratis-Welle, SEO, i18n | 5 bis 7 | **Öffentliche Gratis-Beta** |
| **M3** | Gradient-Tools, lokales Speichern, lokales Brand Kit, Spenden | 8 bis 10 | Nutzer können ohne Konto speichern |
| **M4** | Flaggschiff-Patterns, Shape-Bibliothek, GIF | 11 bis 14 | **Öffentlicher Launch** |
| **M5** | WebGL & Bildeffekte & Video | 15 bis 18 | Trend-Tools |
| **M6** | Social Media Editor + restliche Effekte | 19 bis 23 | Marketing-Zielgruppe |
| **M7** | Differenzierung: Composer, Code-Exporte, Plugins | 24+ | Wachstum |

---

## M0: Setup & Fundament (Woche 1)

- [x] Monorepo (pnpm, Turborepo), Struktur gemäss `ARCHITECTURE.md` Abschnitt 3
- [x] `apps/web` mit Next.js (App Router), TypeScript strict, Tailwind, shadcn/ui
- [x] ESLint inkl. Regel "kein `Math.random` in packages/engine", Prettier, Husky + lint-staged
- [x] Vitest + Playwright eingerichtet, GitHub Actions (lint, typecheck, test, build)
- [x] Design-Tokens Light/Dark, Basis-Layout, Theme-Switch (⌘⇧K)
- [x] `packages/engine`: PRNG (`mulberry32`), Vektor-Helfer, Catmull-Rom zu Bezier, Poisson-Disk
- [x] Deployment-Pipeline (Preview pro PR, Production auf `main`)

**DoD**: CI grün, Preview-URL zeigt leere App in Light/Dark, Engine-Helfer mit Unit-Tests.

## M1: Editor-Shell + erste Tools (Woche 2 bis 4)

- [x] `ToolDefinition`-Typen und Registry (`packages/tool-registry`)
- [x] Editor-Shell: Auto-Controls aus Zod-Schema, Presets-Leiste, Vorschau mit Zoom/Fit, Randomize (Leertaste) mit Locks, Undo/Redo, Varianten-Filmstreifen
- [x] Export-Dialog + Exporter: SVG (kompakt aus dem Generator, ohne SVGO), CSS, PNG/JPG/WebP (frei wählbare Grösse), Clipboard
- [x] Share via URL-Hash (Params komprimiert)
- [x] Tools: **CSS Gradient**, **Blob**, **SVG Waves**, **Polka Dots**
- [x] Alle 6 **Converters**
- [x] Snapshot-Tests für jedes Tool/Preset; visueller Test Vorschau == PNG-Export

**DoD**: Ein Tool hinzufügen = eine neue Datei in der Registry + Presets, keine Änderung an der Shell. Export in Chrome, Safari, Firefox identisch zur Vorschau.

## M2: Gratis-Welle, SEO, i18n (Woche 5 bis 7) ► öffentliche Beta

- [x] Tools: **CSS Pattern Library + Editor**, **Grid Patterns**, **Confetti**, **Starry Sky**, **Dieter Dots**, **Noise/Grain** (E2E in Chromium, Firefox und WebKit grün)
- [x] Farbtools: **Palette Generator**, **Tints & Shades**, **Tailwind Palette**, **Palette aus Bild** (E2E in Chromium, Firefox und WebKit grün)
- [x] i18n mit next-intl (DE, EN zuerst; FR, IT vorbereitet), lokalisierte Slugs, `hreflang`
- [x] SEO-Landingpage-Template pro Tool (Inhalte aus i18n-Dateien), Katalog, Kategorie-Seiten, Sitemap, strukturierte Daten, OG-Bilder pro Tool und Sprache (beim Build gerendert, siehe `ARCHITECTURE.md` Abschnitt 7)
- [ ] Startseite, Impressum, Datenschutz (nDSG/DSGVO), cookiefreie Analytics, Sentry (im Code fertig; offen: juristische Prüfung der Rechtstexte, Analytics- und Sentry-Variablen durch Andreas)
- ~~**Founders-Warteliste**~~ entfällt (Entscheid 2026-10-28: keine Zahlungen); Code in M3-AP13 entfernt
- [ ] Lighthouse ≥ 95 (Performance, SEO, A11y) auf Landingpages (Performance 95 bis 99 und A11y 100 lokal gemessen; SEO erst auf dem Produktions-Host messbar, wegen noindex auf allen anderen Hosts)

**DoD**: Live unter eigener Domain, 15+ Tools, alle Seiten in DE und EN indexierbar, Search Console eingerichtet.

## M3: Gradient-Tools, lokales Speichern, lokales Brand Kit, Spenden (Woche 8 bis 10)

- [x] Tools: **Mesh Gradients**, **Blurry Gradients**, **Striped Gradients**, **Blob Composition**, **Doodle Backgrounds**, **SVG Charts**
- [x] Programmatic-SEO: Gradient- und Paletten-Sammlungsseiten
- [x] Tool **Seamless Patterns** (aus M4 vorgezogen): 4 Kachel-Modi, eigene Shapes, SVG/Bild-Upload mit Zuschnitt nur im Browser (Cross-Browser in CI grün)
- [x] Warteliste, Supabase- und Resend-Anbindung sowie Gating-Reste entfernen; alles gratis ohne Limits
- [x] Designs lokal speichern (IndexedDB), Autosave-Entwurf, Übersicht "Meine Designs" mit Suche, Duplizieren, Löschen, Vorschaubild
- [x] Export und Import aller Designs als Datei (JSON, versioniert, beim Import validiert) für andere Geräte
- [x] Brand Kit lokal: Paletten (max. 10 Farben), Logos, eigene SVG-Shapes (**Sanitizer!**), Export/Import als Datei
- [x] Brand-Palette in jedem Tool nutzbar
- [x] Seite "Unterstützen" mit Link zum externen Spendenanbieter, dezenter Hinweis in Footer und Export-Dialog (DE/EN)

**DoD**: Design ohne Konto speichern, nach Neuladen wieder öffnen, per Datei auf ein anderes Gerät übertragen; Brand-Palette in jedem Tool nutzbar; importierte Dateien und SVGs werden strikt validiert bzw. sanitisiert; keine Anfrage an einen eigenen Server beim Speichern (E2E prüft das).

## M4: Flaggschiff-Patterns und Launch (Woche 11 bis 14) ► öffentlicher Launch

- [ ] Tools: **Geometric Patterns** (uniform + dynamic Grid, Tile-Editing); **Seamless Patterns** in M3 vorgezogen (M3-AP12)
- [x] Eigene Shape-Bibliothek (Startziel 150+ Shapes, 12 Packs) + Custom Packs aus Brand Kit: 170 Formen, Pack "Brand Kit" im Picker (M4-AP01, Cross-Browser über CI)
- [x] **GIF-Export** im Worker (M4-AP04)
- [ ] Code-first-Welle (Entscheid 2026-10-28): **Kontrast-Checker** (F6), **CSS-Schatten-Generator** (J1), **Glas- und Rahmen-Effekte** (J2), **Bento-Grid-Generator** (J3), je mit SEO-Landingpage
- [ ] Kurze Nutzungsbedingungen mit freier Lizenz für Exporte (juristisch zu prüfen)
- [ ] Launch-Kommunikation (Product Hunt, Reddit, Swiss-Communities), Changelog

**DoD**: Geometric Patterns und GIF-Export in Chrome, Safari, Firefox identisch zur Vorschau; Shape-Bibliothek mit Lizenzen in `assets/LICENSES.md`; Nutzungsbedingungen geprüft.

## M5: WebGL, Bildeffekte, Video (Woche 15 bis 18)

- [ ] WebGL2-Wrapper, Shader-Hot-Reload im Dev-Modus
- [ ] **Shader Gradient Editor** inkl. Presets (Liquid, Silk, Streaked, Grainy), Dithering, Grain, Vignette
- [ ] **Video-Modus**: Keyframes, Timeline, nahtloser Loop; Export MP4/WebM via WebCodecs + Muxer, Fallback MediaRecorder; Hinweis bei nicht unterstützten Browsern
- [ ] Hochauflösender Export (4K/8K) via Kachel-Rendering
- [ ] **3D Perspective Grid** (inkl. Animation)
- [ ] Bildeffekt-Pipeline im Worker: **Halftone**, **CMYK Halftone**, **Dither**

**DoD**: 10-Sekunden-Loop in 1080p exportiert in Chrome und Safari (Version mit WebCodecs) ohne sichtbaren Loop-Sprung; Effekt-Vorschau bleibt bei 12-MP-Bildern flüssig (UI-Thread nie > 50 ms blockiert).

## M6: Social Media Editor + restliche Effekte (Woche 19 bis 23)

- [ ] Konva-Canvas mit Ebenen, Transform, Snapping, Ausrichtungshilfen, Gruppierung
- [ ] Text mit Effekten, Font-Auswahl (OFL-Fonts), Brand-Fonts
- [ ] Hintergründe aus allen Tools (als parametrische Referenz)
- [ ] Formate + **Magic Resize** (Constraint-System)
- [ ] 100 eigene Templates, **Brand-Apply** mit einem Klick
- [ ] Tools: **God Rays**, **Fractal Glass**, **Pixelate/Posterize**
- [ ] FR- und IT-Übersetzungen live

**DoD**: Ein Template in 6 Formate per Magic Resize, ohne dass Text abgeschnitten wird (automatischer Test für alle Templates).

## M7: Differenzierung & Wachstum (ab Woche 24)

Reihenfolge nach Nutzerfeedback festlegen. Kandidaten:

- [ ] **Composer**: beliebige Tools als parametrische Ebenen, Blend-Modes, Masken
- [ ] **Code-Exporte**: React-Komponente, Web-Component für Shader
- [ ] **Figma-Plugin**, **Framer-Plugin** (gratis)
- [ ] Transparenzseite: Fixkosten und Spendeneingang pro Jahr

Bewusst nicht (Entscheid 2026-10-28): KI über bezahlte Modelle, öffentliche API, Community mit Server-Daten, Teams, Brand Kit aus URL. Nur mit neuem Entscheid Andreas und fixem Budget.

---

## Risiken und Gegenmassnahmen

| Risiko | Auswirkung | Massnahme |
|---|---|---|
| Browser-Unterschiede bei SVG-Filtern/Canvas | Vorschau ≠ Export | Ein Render-Pfad, Cross-Browser-Visual-Tests ab M1 |
| WebCodecs/Video nicht überall verfügbar | Video-Export fehlt | Feature-Detection, WebM-Fallback, klare Meldung |
| SEO braucht Monate | Wenig Traffic zum Launch | Gratis-Beta früh (M2), Inhalte in 4 Sprachen, Product Hunt/Reddit/Swiss-Communities |
| Rechtliche Nähe zum Vorbild | Abmahnung | Clean-Room, eigener Name, eigene Assets, juristische Prüfung vor Launch |
| SVG-Uploads als XSS-Vektor | Sicherheitslücke | Strikter Sanitizer, CSP, Uploads nie inline vom eigenen Origin ausliefern |
| Zu viele Tools, zu wenig Tiefe | Mittelmass | Nach M4 cookiefreie Nutzungsdaten auswerten, Top-5-Tools vertiefen statt nur verbreitern |
| Solo-Kapazität | Verzögerung | Tool-Architektur strikt einhalten, Agent arbeitet in kleinen, getesteten Schritten |
| Spenden decken die Fixkosten nicht | Betrieb nicht finanziert | Fixkosten minimal halten (Cloudflare-Gratis-Kontingent, statische Seiten), keine Kosten pro Nutzer, Spenden-Hinweis dezent aber sichtbar |
| Lokale Daten gehen verloren (Browser-Speicher gelöscht) | Nutzer verlieren Designs | Datei-Export/-Import prominent, Hinweis in "Meine Designs", `navigator.storage.persist()` anfragen |
| Gratis-Angebot wird missbraucht (Last) | Kosten trotz Gratis-Kontingent | Alles im Browser, keine Server-Endpunkte mit Nutzerdaten, Cloudflare-Limits beobachten |
