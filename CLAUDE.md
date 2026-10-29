# CLAUDE.md: Projektanweisungen für den AI-Coding-Agent

## Projekt in Kürze

**Musterli** (früher Arbeitstitel Motivo, Domain `musterli.app`) ist eine Web-Toolbox mit 30+ Generatoren für Muster, Verläufe, Hintergründe, Bildeffekte und Farben. Nutzer erzeugen per Klick (Leertaste = neue Variante) markengerechte Grafiken und exportieren sie als PNG/JPG/WebP, SVG, CSS, GIF, MP4/WebM oder Code. Inspiriert vom Funktionsumfang von magicpattern.design, aber **eigenständig umgesetzt** (Clean-Room, siehe unten).

**Finanzierung: komplett gratis, spendenfinanziert.** Keine Konten, keine Zahlungen, keine Lizenzen, keine Credits, keine Bezahlschranke. Speichern und Brand Kit nur lokal im Browser. Details in `docs/PRODUCT.md` Abschnitt 6.

## Pflichtlektüre vor jeder Aufgabe

| Datei | Inhalt | Wann lesen |
|---|---|---|
| `ORCHESTRATOR.md` | Rolle, Ablauf und Regeln des Orchestrators; Subagents in `.claude/agents/` | Wenn du als Orchestrator arbeitest |
| `docs/PROGRESS.md` | Aktueller Stand, Arbeitspakete, Blocker | Zu Beginn jeder Sitzung |
| `docs/ROADMAP.md` | Meilensteine, Checklisten, Definition of Done | **Immer zuerst**: aktuellen Meilenstein bestimmen |
| `docs/ARCHITECTURE.md` | Stack, Monorepo, Tool-Interface, Datenmodell, Sicherheit | Vor jeder Code-Änderung |
| `docs/TOOLS.md` | Spezifikation jedes Tools (Parameter, Algorithmus, Exporte) | Vor Arbeit an einem Tool |
| `docs/DESIGN.md` | Layout, Controls, Shortcuts, Tokens, Microcopy | Vor UI-Arbeit |
| `docs/PRODUCT.md` | Vision, Personas, Pläne, Nicht-Ziele | Bei Scope-Fragen |
| `docs/ANALYSE.md` | Reverse Engineering des Vorbilds | Hintergrund, bei Feature-Fragen |

## Arbeitsweise

1. **Meilenstein für Meilenstein.** Arbeite nur an Aufgaben des aktuellen Meilensteins in `ROADMAP.md`. Hake Checkboxen ab, wenn erledigt und getestet.
2. **Kleine Schritte.** Pro Aufgabe: kurz planen, umsetzen, Tests schreiben und nur die betroffenen ausführen (`pnpm test:affected`, E2E nur Chromium und nur betroffene Specs), typecheck + lint, dann committen (Conventional Commits, z. B. `feat(engine): add blob generator`).
3. **Erst fragen, dann bauen**, wenn: eine Anforderung unklar ist, eine neue Dependency mit > 50 KB gzip nötig wäre, das Datenmodell geändert werden muss, oder etwas den Nicht-Zielen in `PRODUCT.md` widerspricht.
4. **Nichts erfinden.** Bei APIs von Libraries (Next.js, OpenNext/Cloudflare, WebCodecs, IndexedDB, Konva, Figma) die aktuelle offizielle Doku prüfen statt aus dem Gedächtnis zu arbeiten. Versionen in `package.json` sind die Wahrheit.
5. **Doku nachführen.** Wenn sich eine Entscheidung ändert, die betroffene Datei in `docs/` im selben Commit aktualisieren und unten im Entscheidungslog eintragen.

## Nicht verhandelbare Regeln

### Architektur
- **Jedes Tool ist eine `ToolDefinition`** in `packages/tool-registry` (Zod-Schema, Defaults, Presets, `randomize`, `render`, `exports`). Keine Tool-spezifische Logik in der Editor-Shell.
- **Ein Render-Pfad**: Vorschau und Export verwenden dieselbe Render-Funktion.
- **Deterministisch**: In `packages/engine`, `packages/effects`, `packages/shaders` niemals `Math.random()`, `Date.now()` oder DOM-Zugriffe. Zufall nur über den übergebenen seeded `Rng`.
- **Rechenintensives in Web Worker** (Bildeffekte, GIF, Video, grosse Exporte). UI-Thread nie länger als 50 ms blockieren.
- **Schwere Libraries dynamisch laden** (`next/dynamic`, `import()`), z. B. Konva, gifenc, Muxer, three.js.

### Sicherheit
- Falls je wieder eine Datenbank dazukommt: **RLS auf jeder Tabelle**, Policies mit Tests.
- **SVG-Uploads immer sanitizen** (keine Scripts, Event-Handler, `foreignObject`, externen Referenzen). Nie Nutzer-SVG unsanitized per `dangerouslySetInnerHTML` rendern.
- Secrets nur in Umgebungsvariablen, nie im Client-Bundle (nur `NEXT_PUBLIC_*` ist öffentlich und darf nichts Geheimes enthalten).
- Importierte Dateien (Designs, Brand Kit) strikt validieren (Zod, Grössenlimit), nie ungeprüft übernehmen.
- Serverseitige Fetches auf Nutzer-URLs nur mit SSRF-Schutz (keine privaten IP-Ranges, Timeouts, Grössenlimit).

### Gratis und spendenfinanziert
- **Keine Konten, kein Login, keine Zahlungsintegration** (kein Stripe, keine Lizenzen, keine Credits, kein Gating, keine Wasserzeichen). Spenden nur als Link zu einem externen Anbieter; einzige Ausnahme ist der Ko-fi-Spendenknopf (Script von Ko-fi) auf der Startseite (Entscheid Andreas 2026-10-28). Keine weiteren fremden Scripts ohne Entscheid Andreas.
- **Keine laufenden Kosten pro Nutzer.** Alles clientseitig: Rendern, Exportieren, Speichern (IndexedDB), Brand Kit, Uploads. Keine Server-Endpunkte, die Nutzerdaten speichern.
- Funktionen mit Kosten pro Nutzer (KI, Server-Speicher, API, Server-Rendering) nur mit Entscheid Andreas und fixem Budget mit hartem Tageslimit.
- Keine Cookies, keine Personendaten auf unseren Servern.

### Code-Qualität
- TypeScript `strict`, kein `any` ohne Kommentar mit Begründung.
- Tests: jede Engine-Funktion mit Unit-Test; jedes Tool mit Snapshot-Test pro Preset (`seed = 1`); `defaults` und `presets` müssen `schema.parse` bestehen.
- Komponenten zugänglich (Tastatur, Labels, Fokus). axe-Check in E2E.
- Keine hartkodierten UI-Texte: alles über i18n-Keys (`next-intl`), DE und EN mindestens.

### Inhalte und Recht (Clean-Room)
- **Keine** Texte, Bilder, Shapes, Packs, Templates, Code oder Markenelemente von magicpattern.design oder anderen Produkten übernehmen. Nur allgemein bekannte Algorithmen umsetzen.
- Fonts nur mit OFL/Apache-Lizenz; Lizenz jeder Asset-Quelle in `assets/LICENSES.md` dokumentieren.

### Sprache und Stil
- Code, Kommentare, Commit-Messages: **Englisch**.
- Nutzertexte: DE (Schweizer Rechtschreibung, **kein Eszett, immer ss**, Du-Form), EN, später FR/IT.
- In deutschen Texten keine Gedankenstriche als Satzzeichen; Kommas, Klammern oder neue Sätze verwenden.

## Befehle (nach M0 gültig, bei Änderungen hier nachführen)

```bash
pnpm install            # Abhängigkeiten
pnpm dev                # Web-App lokal (apps/web)
pnpm build              # Alle Pakete bauen
pnpm test               # Vitest (alle Pakete)
pnpm test:affected      # Vitest nur geänderte Pakete (Standard nach jeder Aufgabe; Basis: TURBO_SCM_BASE)
pnpm test:e2e           # Playwright (alle Browser, nur manuell)
pnpm test:e2e:chromium  # Playwright nur Chromium
pnpm --filter @musterli/web cf:preview  # Build für Cloudflare + lokale Vorschau in workerd
pnpm lint && pnpm typecheck
```

## Neues Tool hinzufügen (Checkliste)

1. Spezifikation in `docs/TOOLS.md` lesen.
2. Generator in `packages/engine/src/tools/<tool-id>/` (rein, testbar) bzw. `packages/effects` oder `packages/shaders`.
3. `ToolDefinition` in `packages/tool-registry/src/tools/<tool-id>.ts` mit Schema, Defaults, mindestens 6 Presets, `randomize`.
4. In der Registry registrieren.
5. i18n-Keys: Name, Kurzbeschreibung, Control-Labels, SEO-Texte (Was ist, Anleitung, 3 bis 5 FAQ).
6. Tests: Schema, Snapshots pro Preset, Export-Smoke-Test.
7. Tool im Katalog, auf Kategorie-Seite und in der Sitemap prüfen.
8. Eintrag im Changelog (`apps/web/content/changelog`).

## Definition of Done (für jede Aufgabe)

- [ ] Funktioniert in Chrome (aktuelle Version); Safari und Firefox werden nicht mehr getestet (Entscheid Andreas 2026-10-28)
- [ ] Light und Dark Mode geprüft
- [ ] Tastaturbedienung geprüft
- [ ] Tests geschrieben und grün; `pnpm lint && pnpm typecheck` grün
- [ ] i18n-Keys für DE und EN vorhanden
- [ ] Relevante `docs/` aktualisiert, Roadmap-Checkbox abgehakt

## Entscheidungslog

| Datum | Entscheidung | Begründung |
|---|---|---|
| 2026-10-27 | Next.js (Supabase und Stripe überholt 2026-10-28), Monorepo mit pnpm/Turborepo | SEO-Seiten + interaktiver Editor + Plugins teilen sich Engine-Code |
| 2026-10-27 | Client-first Rendering, schema-getriebene Tools | Tiefe Betriebskosten, 30+ Tools mit kleiner Crew wartbar |
| 2026-10-27 | Arbeitstitel "Motivo" | Vor Launch Marke/Domain prüfen |
| 2026-10-27 | (überholt 2026-10-28) Lifetime-Lizenzen statt Abos, KI/API über Credits, Preistreppe Founders/Early Bird/Regulär | Klare Differenzierung, keine Abo-Müdigkeit; laufende Kosten bleiben dank Client-Rendering und Credits gedeckt |
| 2026-10-27 | Hosting auf Cloudflare Workers via OpenNext statt Vercel | Entscheid Andreas; Preview-Deployments pro PR über Cloudflare |
| 2026-10-27 | TypeScript auf 6.0.x gepinnt (nicht 7.x) | typescript-eslint unterstützt aktuell nur TypeScript < 6.1; bei Support upgraden |
| 2026-10-27 | Deploy über GitHub Actions statt Cloudflare Workers Builds | Workers Builds konnte das Repo wiederholt nicht klonen; Actions-Deploy ist unabhängig davon und zeigt Preview-URL im PR |
| 2026-10-27 | Statistik mit Cloudflare Web Analytics, Fehler mit Sentry EU (nur Client, lazy, 19,8 KB gzip); beide nur mit Env-Variable im Produktions-Build; keine Cookies (auch kein next-intl-Sprachcookie) | Entscheid Andreas; cookiefrei, gratis, kein Cookie-Banner; Details `docs/ARCHITECTURE.md` Abschnitt 13 |
| 2026-10-27 | Kein SVGO in M1 | Generatoren erzeugen bereits kompaktes SVG; SVGO wäre über 50 KB gzip. Neubeurteilung bei Nutzer-Uploads (M4) |
| 2026-10-27 | URL-Slugs zentral in `apps/web/i18n/slugs.ts`, hreflang über Metadata API, alte Pfade per 308 im Proxy | Eine Datenquelle für Proxy, Server und Client; next-intl-Link-Header kennen keine Slugs; M1-Share-Links bleiben gültig (Details `docs/ARCHITECTURE.md` Abschnitt 7) |
| 2026-10-27 | CSP ohne Nonces, mit `'unsafe-inline'` für Scripts und Styles; Header aus `lib/security-headers.ts` (next.config, proxy, `public/_headers`) | Nonces erzwingen dynamisches Rendering; Next setzt auf statischen Seiten seitenspezifische Inline-Scripts, ein Hash würde `'unsafe-inline'` abschalten. Theme-Hash liegt bereit (`lib/csp-hash.ts`) |
| 2026-10-27 | OG-Bilder als Build-Schritt (`scripts/og-images.mjs`) statt `next/og` im Worker | `next/og` hätte das Worker-Bundle von ca. 1.5 auf 2.6 MiB gzip vergrössert (Gratis-Limit 3 MiB); statisch = keine Kosten pro Anfrage |
| 2026-10-27 | (überholt 2026-10-28, entfernt in M3-AP13) Founders-Warteliste: Supabase (eu-central-2) und Resend per `fetch` ohne SDK; Zugriff nur über SECURITY-DEFINER-Funktionen (RLS ohne Policies); Migrations- und RLS-Tests mit PGlite und nachgebildeten Supabase-Rollen | Keine neue Laufzeit-Dependency, Tests ohne Docker in CI; Details `docs/ARCHITECTURE.md` Abschnitt 14 |
| 2026-10-27 | hreflang x-default zeigt auf EN; Indexierung nur auf dem Host von `NEXT_PUBLIC_SITE_URL`, sonst `X-Robots-Tag: noindex` | Internationaler Standard; Preview-Deployments dürfen nicht im Index landen |
| 2026-10-28 | Sammlungsseiten (Verläufe, Paletten) als eigene Daten in `apps/web/lib/collections/`, Farben als OKLCH-Tupel im sRGB-Gamut, statisch generiert, Editor-Links über den Share-Hash | Clean-Room, keine laufenden Kosten, ein Render-Pfad; Kategorie-Seiten zeigen den Teaser ohne Vorschauen, sonst +90 KiB gzip im Worker (Details `docs/ARCHITECTURE.md` Abschnitt 7) |
| 2026-10-28 | Mesh-Verlauf: bei grosser Unschärfe zeichnet die Engine die Flächen selbst als kleines PNG statt `feGaussianBlur` (`meshBlurPlan`, Grenze σ 200 px bei 8192 px) | Browser kappen σ bei ca. 270 bis 520 px, grosse Exporte wichen sonst sichtbar von der Vorschau ab; schneller und weniger Speicher, ein Render-Pfad bleibt |
| 2026-10-28 | **Komplett gratis und spendenfinanziert**: keine Konten, keine Zahlungen, keine Lizenzen, keine Credits; Speichern und Brand Kit lokal (IndexedDB plus Datei-Export); Warteliste und Supabase/Resend entfallen; ersetzt die Lifetime-Entscheide vom 2026-10-27 | Entscheid Andreas; keine laufenden Kosten pro Nutzer, keine Personendaten, kein Zahlungs- und Steueraufwand |
| 2026-10-28 | Rasterexport über 4096² px: PNG in Streifen mit eigenem Streaming-Encoder, JPG/WebP mit Prüfpixeln und Fehlermeldung `too-large` | WebKit zeichnet grössere Canvas und Bitmaps leer; keine neue Dependency |
| 2026-10-28 | Gating-Feld aus `ToolDefinition` und allen Tools entfernt (statt überall `{}`), Lizenzstufen-Typen gelöscht; Warteliste, `packages/db`, `supabase/`, API-Routen und Turnstile ausgebaut; alte Warteliste-URLs per 308 auf "Unterstützen" | Alles gratis ohne Limits; ein Feld ohne Bedeutung lädt zu neuem Gating ein. Worker 2284 ► 2194 KiB gzip (M3-AP13) |
| 2026-10-28 | Spenden-Link als Build-Variable `NEXT_PUBLIC_DONATION_URL` (nur https, ohne Zugangsdaten, `lib/donation.ts`); ohne Variable zeigt die Seite "Spenden-Link folgt bald"; Hinweis im Export-Dialog über generischen Slot `afterExport` der Editor-Shell, öffnet in neuem Tab | Reiner Link ohne Script, CSP unverändert; Anbieter wechselbar ohne Code; Editor-Shell bleibt app-neutral (M3-AP14) |
| 2026-10-28 | Designs lokal in IndexedDB ohne Library (`@musterli/storage`), Parameter getrennt von der Übersicht, Öffnen über `#design=<id>`, Datei-Import im Worker mit Zod, Tool-Schema und erneutem Sanitizing | Keine Dependency, keine Kosten, nichts verlässt den Browser; Details `docs/ARCHITECTURE.md` Abschnitt 6 |
| 2026-10-28 | Brand Kit in IndexedDB Version 2 (eigene Stores), eigenes Dateiformat `motivo-brandkit` v1 getrennt von `motivo-designs`; Brand-Palette generisch aus dem Tool-Schema mit optionalem Hook `brandPalette`, Anwenden sperrt die Farben | Designs- und Brand-Kit-Dateien unabhängig versionierbar; neue Tools erhalten die Brand-Palette ohne Code; die Leertaste behält Markenfarben (Details `docs/ARCHITECTURE.md` Abschnitte 4.4 und 6) |
| 2026-10-28 | GIF-Export mit **gifenc** 1.0.3 (MIT, ca. 4 KB gzip), nur im GIF-Worker per `import()`; Opt-in `ToolDefinition.animation` (ersetzt `supportsAnimation`), GIF folgt daraus statt aus `exports`; Budget 30 Mio. Pixel, Kante 1024 px, 2 bis 60 Bilder | Kleinste brauchbare Library ohne Abhängigkeiten; eine Zeile pro Tool; Vorschau und GIF teilen den Render-Pfad (Details `docs/ARCHITECTURE.md` Abschnitt 5) |
| 2026-10-28 | Name **Musterli** statt Motivo, Domain `musterli.app` (Andreas); überall umbenannt inkl. Paketscope `@musterli/*` und Exportdateinamen. Unverändert bleiben gespeicherte Kennungen (IndexedDB `motivo`, Dateiformate `motivo-designs`/`motivo-brandkit`, localStorage `motivo-theme`/`motivo.export.format`), der Worker `motivo-web` und das Repo `afischZH/motivo` | Entscheid Andreas; bestehende Daten und Dateien bleiben lesbar, Preview- und Produktions-URLs ändern sich nicht |
| 2026-10-28 | Neue Tools für M4: Kontrast-Checker, CSS-Schatten, Glas- und Rahmen-Effekte, Bento-Grid (Specs `docs/TOOLS.md` F6, J1 bis J3) | Entscheid Andreas; rein clientseitig, Code-first für Entwickler, starke SEO-Begriffe |
| 2026-10-28 | Eigene Formenbibliothek: 170 selbst gezeichnete Formen in 12 Packs (zentrierte 100er-Box, Nonzero, optionale Akzent-Ebene, Kachel-Formen für Truchet), Ids stabil; generische Picker-Hinweise `optionGroups` und `brandShapesParam` | Clean-Room ohne Asset-Lizenzen; eine Quelle für Seamless und Geometric Patterns; Brand-Kit-Formen ohne Tool-Code (M4-AP01, Details `docs/ARCHITECTURE.md` 4.6) |
| 2026-10-28 | Generischer Hook `ToolDefinition.suggestions` (Ein-Klick-Vorschläge als Undo-Schritt, Abschnitt "Vorschläge" über den Einstellungen); CSS-Schatten nutzt `CssOutput.element` und die Kategorie `css-effects` aus AP06 | Kontrast-Vorschläge (F6) ohne Tool-Code in der Shell; anders als `advisories` ändern Vorschläge die Params (M4-AP05, Details `docs/ARCHITECTURE.md` 4.7) |
| 2026-10-28 | Kachel-Editing über generischen Hook `ToolDefinition.regionEditor` (Zellen-Wähler und Popover in der Editor-Shell); Bearbeitungen als normaler Param `tileOverrides` (höchstens 128, Zellen-Id aus der Rasterposition) | Shell bleibt Tool-neutral; Teilen-Link, Designs und Undo funktionieren ohne Sonderweg; 128 Bearbeitungen passen sicher in den Teilen-Link (Details `docs/ARCHITECTURE.md` Abschnitt 4.8) |
| 2026-10-28 | Scope-Erweiterung M4-AP06b (Entscheid Andreas): Bento-Grid mit Kachelinhalten (Titel, Untertitel, Symbol, eigene Grafik, Kachel- und Raster-Hintergrundbild) über den `regionEditor`, Glas- und Rahmen-Effekte mit eigenem Hintergrundbild. Kachel-Key `t<n>` nach Lesereihenfolge; Text und Symbole im Teilen-Link, alle Uploads nur lokal (`localParams`, Share-Codec lässt sie weg); Code-Exporte mit Platzhaltern statt data-URI (Glas optional eingebettet) | Wunsch nach echten Inhalten statt Platzhaltern; kein freier Layout-Editor, keine neue Dependency, keine Kosten; Teilen-Links bleiben kurz, Nutzerdateien verlassen das Gerät nicht (Details `docs/TOOLS.md` J2/J3, `docs/ARCHITECTURE.md` 4.8 und Sicherheit) |
| 2026-10-28 | Ko-fi-Widget (schwebender Spendenknopf, Script von storage.ko-fi.com) nur auf der Startseite statt reinem Link; aktiv nur, wenn `NEXT_PUBLIC_DONATION_URL` eine Ko-fi-Seite ist; CSP als Dienst `kofi` geöffnet, ohne Google Fonts; Datenschutzerklärung ergänzt (juristisch zu prüfen) | Entscheid Andreas; Ko-fi erhält beim Aufruf der Startseite IP und User Agent, Cookies nur im Spendenformular auf ko-fi.com |
| 2026-10-28 | Schlanke Tests: nach jeder Aufgabe nur Lint, Typecheck, `test:affected` und betroffene Chromium-Specs; CI-E2E in Draft-PRs und auf main nur Chromium, alle drei Browser erst bei "ready for review" (Meilenstein-Abnahme) | Wunsch Andreas; kürzere Wartezeiten, Firefox/WebKit-Fehler werden trotzdem vor jedem Release gefunden |
| 2026-10-28 | Generative Welle M4b (Entscheid Andreas): Höhenlinien, Flow Fields, Low-Poly/Voronoi, Guilloche, Terrazzo, Screenshot-Verschönerer; eigene Helfer ohne Library (Rauschen, Marching Squares, Polylinien, Delaunay/Voronoi, Scheiben-Streuung, adaptive Kurvenabtastung); Budgets unabhängig von der Leinwandgrösse statt SVGO; GIF-Quelle "time" mit Bild 0 = Vorschau | Keine Dependency, deterministisch, kompakte SVGs; Details `docs/TOOLS.md` K1 bis K6, `docs/ARCHITECTURE.md` 4.9 bis 4.11 |
| 2026-10-28 | Screenshot-Verschönerer: Screenshots lokal als PNG bis 3840 px, nie im Teilen-Link; generischer Hook `sizePresets`; grosse Uploads in der Vorschau als `blob:`-URLs | Nutzerdateien verlassen das Gerät nicht; Shell bleibt Tool-neutral (M4b-AP04) |
| 2026-10-28 | Browser-Tests nur noch in Chrome (Chromium), auch in CI und vor dem Live-Schalten; Firefox- und WebKit-Projekte bleiben in `playwright.config.ts` für manuelle Läufe; ersetzt die 3-Browser-Regel vom selben Tag | Wunsch Andreas; schnellere Durchläufe. Risiko: Safari-spezifische Fehler (z. B. grosse Canvas, Select-Überlauf) fallen erst bei Nutzern auf |
| 2026-10-28 | Website-Mockups im Screenshot-Verschönerer (Entscheid Andreas): Live-Ansicht lädt die eingegebene https-URL im Browser des Nutzers in sandboxed iframes, Aufnahme per `getDisplayMedia` des eigenen Tabs; nur auf den zwei Tool-Seiten `frame-src https:` und `display-capture=(self)`; generischer Hook `ToolDefinition.liveView` | Kein Server-Abruf, keine Kosten, kein SSRF-Risiko; Seiten mit Einbettungsverbot brauchen weiter einen Upload. Datenschutztext juristisch zu prüfen (M4b-AP07) |
| 2026-10-28 | Kleine Welle M4c (Entscheid Andreas, danach M5): Avatar, Platzhalterbild, Favicon-Generator mit Icon-Paket (eigener ZIP- und ICO-Writer, Hook `bundles`, neue Kategorie Icons), animierter CSS-Verlauf (Hook `CssBox.motionCss`), Duotone und ASCII-Art auf neuer Bildeffekt-Grundlage `packages/effects` (Hook `photoSource`, Raster-Stufe im Worker, Fotos bis 4096 px nur lokal) | Keine Dependency, keine Kosten; Bildeffekt-Grundlage wird in M5 für Halftone und Dither wiederverwendet (Details `docs/TOOLS.md` L1 bis L5, `docs/ARCHITECTURE.md` 4.13, 4.14, 5) |
| 2026-10-28 | M5 ohne Video (Entscheid Andreas): Shader-Farbverlauf mit WebGL2-Grundlage `packages/shaders` (Shader-Worker mit OffscreenCanvas, PNG bis 8192² in Kacheln, CPU-Zwilling für statische Motive), Halftone, CMYK-Halftone, Dither (Hooks `ImageEffectRenderer.grid` und `.vector`), 3D-Perspektivgitter; Long-Task-E2E-Tests laufen in einem eigenen Durchgang mit einem Worker | Keine Dependency, keine Kosten; Video (WebCodecs + Muxer) später nach Entscheid Andreas (Details `docs/TOOLS.md` C4, D4, E2 bis E4, `docs/ARCHITECTURE.md` 4.15 bis 4.17, 12) |
