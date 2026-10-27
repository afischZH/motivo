# ROADMAP.md: Umsetzungsplan

Annahme: 1 Person mit AI-Coding-Agent, rund 20 bis 25 Stunden pro Woche. Wochenangaben sind Richtwerte, keine Zusagen. Jeder Meilenstein endet mit einer **Definition of Done (DoD)**, die der Agent abhaken muss, bevor der nächste beginnt.

Gesamtüberblick:

| Meilenstein | Inhalt | Wochen (ca.) | Ergebnis |
|---|---|---|---|
| **M0** | Setup & Fundament | 1 | Repo, CI, Design-System-Basis |
| **M1** | Editor-Shell + erste Tools | 2 bis 4 | 4 Tools + 6 Konverter lokal lauffähig |
| **M2** | Gratis-Welle, SEO, i18n | 5 bis 7 | **Öffentliche Gratis-Beta** |
| **M3** | Accounts, Speichern, Brand Kit, Gradient-Tools | 8 bis 10 | Nutzer können speichern |
| **M4** | Lifetime-Verkauf + Flaggschiff-Patterns | 11 bis 14 | **Lifetime-Launch** (Founders/Early Bird) |
| **M5** | WebGL & Bildeffekte & Video | 15 bis 18 | Trend-Tools, Pro-Mehrwert |
| **M6** | Social Media Editor + restliche Effekte | 19 bis 23 | Marketing-Zielgruppe |
| **M7** | Differenzierung: Composer, KI, Community, API, Plugins | 24+ | Wachstum |

---

## M0: Setup & Fundament (Woche 1)

- [ ] Monorepo (pnpm, Turborepo), Struktur gemäss `ARCHITECTURE.md` Abschnitt 3
- [ ] `apps/web` mit Next.js (App Router), TypeScript strict, Tailwind, shadcn/ui
- [ ] ESLint inkl. Regel "kein `Math.random` in packages/engine", Prettier, Husky + lint-staged
- [ ] Vitest + Playwright eingerichtet, GitHub Actions (lint, typecheck, test, build)
- [ ] Design-Tokens Light/Dark, Basis-Layout, Theme-Switch (⌘⇧K)
- [ ] `packages/engine`: PRNG (`mulberry32`), Vektor-Helfer, Catmull-Rom zu Bezier, Poisson-Disk
- [ ] Deployment-Pipeline (Preview pro PR, Production auf `main`)

**DoD**: CI grün, Preview-URL zeigt leere App in Light/Dark, Engine-Helfer mit Unit-Tests.

## M1: Editor-Shell + erste Tools (Woche 2 bis 4)

- [ ] `ToolDefinition`-Typen und Registry (`packages/tool-registry`)
- [ ] Editor-Shell: Auto-Controls aus Zod-Schema, Presets-Leiste, Vorschau mit Zoom/Fit, Randomize (Leertaste) mit Locks, Undo/Redo, Varianten-Filmstreifen
- [ ] Export-Dialog + Exporter: SVG (mit SVGO), CSS, PNG/JPG/WebP (frei wählbare Grösse), Clipboard
- [ ] Share via URL-Hash (Params komprimiert)
- [ ] Tools: **CSS Gradient**, **Blob**, **SVG Waves**, **Polka Dots**
- [ ] Alle 6 **Converters**
- [ ] Snapshot-Tests für jedes Tool/Preset; visueller Test Vorschau == PNG-Export

**DoD**: Ein Tool hinzufügen = eine neue Datei in der Registry + Presets, keine Änderung an der Shell. Export in Chrome, Safari, Firefox identisch zur Vorschau.

## M2: Gratis-Welle, SEO, i18n (Woche 5 bis 7) ► öffentliche Beta

- [ ] Tools: **CSS Pattern Library + Editor**, **Grid Patterns**, **Confetti**, **Starry Sky**, **Dieter Dots**, **Noise/Grain**
- [ ] Farbtools: **Palette Generator**, **Tints & Shades**, **Tailwind Palette**, **Palette aus Bild**
- [ ] i18n mit next-intl (DE, EN zuerst; FR, IT vorbereitet), lokalisierte Slugs, `hreflang`
- [ ] SEO-Landingpage-Template pro Tool (Inhalte aus i18n-Dateien), Katalog, Kategorie-Seiten, Sitemap, strukturierte Daten, dynamische OG-Bilder
- [ ] Startseite, Impressum, Datenschutz (nDSG/DSGVO), cookiefreie Analytics, Sentry
- [ ] **Founders-Warteliste** (E-Mail mit Double-Opt-in) mit Hinweis auf Lifetime-Preis ab 49, Zähler der Anmeldungen
- [ ] Lighthouse ≥ 95 (Performance, SEO, A11y) auf Landingpages

**DoD**: Live unter eigener Domain, 15+ Tools, alle Seiten in DE und EN indexierbar, Search Console eingerichtet.

## M3: Accounts, Speichern, Brand Kit, Gradient-Tools (Woche 8 bis 10)

- [ ] Supabase-Projekt (EU-Region), Migrationen für `profiles`, `folders`, `designs`, `brand_kits`, `brand_palettes`, `brand_assets`, `export_events`; RLS-Policies + Tests
- [ ] Auth: Magic Link, Google, Apple
- [ ] Designs speichern/laden (`?d=<id>`), Thumbnails (WebP) in Storage, Autosave-Entwurf lokal
- [ ] Dashboard: Raster, Ordner, Suche, Duplizieren, Löschen
- [ ] Brand Kit v1: Paletten (max. 10 Farben), Logos, Upload eigener SVG-Shapes (**Sanitizer!**)
- [ ] Export-Events protokollieren
- [ ] Tools: **Mesh Gradients**, **Blurry Gradients**, **Striped Gradients**, **Blob Composition**, **Doodle Backgrounds**, **SVG Charts**
- [ ] Programmatic-SEO: Gradient- und Paletten-Sammlungsseiten

**DoD**: Nutzer kann sich anmelden, Design speichern, auf anderem Gerät öffnen, Brand-Palette in jedem Tool nutzen. Sicherheitstest: fremde Designs per ID nicht lesbar.

## M4: Lifetime-Verkauf + Flaggschiff-Patterns (Woche 11 bis 14) ► Lifetime-Launch

- [ ] Migrationen für `tiers`, `licenses`, `license_seats`, `purchases`, `credit_ledger`, `price_phases` + RLS + Tests
- [ ] Stripe Checkout als **Einmalzahlung** für Solo, Pro, Upgrade Solo zu Pro (Differenzbetrag) und Credit-Packs; Preise in CHF, EUR, USD; TWINT, Karten, Apple/Google Pay; Stripe Tax; Rechnungen für Firmen
- [ ] Webhooks idempotent: Kauf, Upgrade, Refund; **Preisphasen** (Founders, Early Bird, Regulär) mit atomarem Zähler, automatischer Wechsel zur nächsten Phase
- [ ] `entitlements` serverseitig und clientseitig (Hook `useEntitlement('export.4k')`)
- [ ] Gating in Exportern (Grösse, Format, Wasserzeichen) und Controls (Badges + Lifetime-Popover)
- [ ] Bereich `/app/license`: Lizenz, Belege, Credit-Saldo, Upgrade-Button
- [ ] Pricing-Seite: Lifetime-Vergleich, Phasenpreis mit ehrlichem Restkontingent, Währungsumschalter, Vergleich "Lifetime vs. Abo über 3 Jahre", FAQ zu "Was heisst Lifetime?"
- [ ] Founders-Warteliste per E-Mail über Launch informieren (exklusiver Zugang zu Founders-Preisen)
- [ ] Tools: **Geometric Patterns** (uniform + dynamic Grid, Tile-Editing), **Seamless Patterns** (4 Tiling-Modi, Bild/SVG-Upload, Crop)
- [ ] Eigene Shape-Bibliothek (Startziel 150+ Shapes, 12 Packs) + Custom Packs aus Brand Kit
- [ ] **GIF-Export** im Worker
- [ ] AGB inkl. Lifetime-Definition, Fair Use, Exit-Versprechen, Lizenzbedingungen, 14-Tage-Refund-Prozess (juristisch prüfen lassen)

**DoD**: Testkauf in Stripe-Testmodus für jede Stufe, jede Währung und jede Preisphase; Upgrade verrechnet korrekt; Refund setzt Lizenz zurück; letzte Founders-Lizenz kann bei parallelen Käufen nicht doppelt verkauft werden (Lasttest); Webhook-Ausfall simuliert und nachträglich korrekt verarbeitet.

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
- [ ] **KI "Describe it"**: Prompt ► Params (strukturierter Output, Zod-validiert), Abrechnung über Credits (Inklusivkontingent + Packs)
- [ ] **Brand Kit aus URL** (mit SSRF-Schutz)
- [ ] **Community**: öffentliche Packs/Paletten/Templates, Likes, Remix, Moderation & Melde-Funktion, Lizenz-Checkbox beim Veröffentlichen
- [ ] **Öffentliche API** v1 (SVG/CSS-Tools), API-Keys, Usage-Dashboard, Doku-Seite mit Beispielen
- [ ] **Code-Exporte**: React-Komponente, Web-Component für Shader
- [ ] **Figma-Plugin**, **Framer-Plugin**
- [ ] **Teams**: Workspaces, Rollen, geteilte Brand Kits, Rechnung auf Firma (inkl. CH-MWST-Angaben)

---

## Risiken und Gegenmassnahmen

| Risiko | Auswirkung | Massnahme |
|---|---|---|
| Browser-Unterschiede bei SVG-Filtern/Canvas | Vorschau ≠ Export | Ein Render-Pfad, Cross-Browser-Visual-Tests ab M1 |
| WebCodecs/Video nicht überall verfügbar | Video-Export fehlt | Feature-Detection, WebM-Fallback, klare Meldung |
| SEO braucht Monate | Wenig Traffic zum Bezahl-Launch | Gratis-Beta früh (M2), Inhalte in 4 Sprachen, Product Hunt/Reddit/Swiss-Communities |
| Rechtliche Nähe zum Vorbild | Abmahnung | Clean-Room, eigener Name, eigene Assets, juristische Prüfung vor Launch |
| SVG-Uploads als XSS-Vektor | Sicherheitslücke | Strikter Sanitizer, CSP, Uploads nie inline vom eigenen Origin ausliefern |
| Zu viele Tools, zu wenig Tiefe | Mittelmass | Nach M4 Nutzungsdaten auswerten, Top-5-Tools vertiefen statt nur verbreitern |
| Solo-Kapazität | Verzögerung | Tool-Architektur strikt einhalten, Agent arbeitet in kleinen, getesteten Schritten |
| Lifetime: keine wiederkehrenden Einnahmen | Umsatz bricht nach Launch-Welle ein | SEO als Dauermotor, Upgrades, Credit-Packs, Team-Lizenzen; Reserve-Quote aus jedem Verkauf (`PRODUCT.md` 6.5) |
| Lifetime: laufende Kosten pro Nutzer steigen | Verlust pro Käufer über die Jahre | Client-Rendering, KI/API nur über Credits, Speicher mit Fair Use; Kosten pro aktivem Nutzer monatlich messen |
| Lifetime: Preis zu tief angesetzt | Kein Spielraum mehr | Preistreppe, Preise für Neukunden dürfen steigen, Bestandskunden behalten alles |
| Erwartung "alles für immer" | Supportlast, Unmut bei Einschränkungen | Klare Lifetime-Definition in AGB und FAQ, Exit-Versprechen, Credits transparent anzeigen |
