# PROGRESS.md: Logbuch des Orchestrators

> Wird vom Orchestrator gepflegt (siehe `ORCHESTRATOR.md`). Neueste Einträge oben. Jede Sitzung endet mit einem aktuellen "Nächster Schritt".

## Aktueller Stand

- **Meilenstein**: M2 (freigegeben 2026-10-27 mit Empfehlungen: Cloudflare Web Analytics, Sentry EU gratis, Warteliste mit Supabase + Resend am Schluss). M1 abgenommen und live seit 2026-10-27 (PR #2, Merge e56e13f). M0 live seit 2026-10-27.
- **Letzte Sitzung**: 2026-10-27 (Cloud-Sitzung)
- **Nächster Schritt**: M2 im Code abgeschlossen (2026-10-27): alle 12 APs zusammengeführt, CI auf 3678eb8 grün in Chromium, Firefox und WebKit. Wartet auf Andreas: Meilenstein-Abnahme und Merge von PR #3 (Produktions-Deploy), Impressum-Angaben, Domain, Analytics-Token, Sentry-DSN, Supabase-Projekt, Resend, Turnstile, Entscheid zum Mail-Tagesbudget der Warteliste, juristische Prüfung der Rechtstexte. Danach M3-Plan.
- Offen für vor Launch: CSP und Security-Header (Theme-Script per sha256 erlauben), als M2-AP11 eingeplant.

## Arbeitspakete des aktuellen Meilensteins

### M2: SEO-Seiten, mehr Tools, Beta (freigegeben 2026-10-27)

| ID | Titel | Agent | Status | Abhängig von | Notiz |
|---|---|---|---|---|---|
| M2-AP01 | Tools **Grid Patterns**, **Confetti**, **Starry Sky**, **Dieter Dots** | engine-dev | erledigt (Cross-Browser in AP12) | – | Je 7 Presets; Limits wie Polka Dots (≥ 4 px, ≤ 10 000 Elemente); Grid und Dieter Dots ohne Seed-Einfluss; Changelog-Format: eine Datei pro Sprache (Orchestrator-Entscheid) |
| M2-AP02 | Tool **Noise/Grain** | engine-dev | erledigt (Cross-Browser in AP12) | – | Gauss-Kachel 256 px als PNG im SVG-Pattern (kein feTurbulence, rendert je Browser anders); Code in engine statt effects; SVG 90 bis 260 KB |
| M2-AP03 | **CSS Pattern Library** (Dots, Grid, Stripes, Waves, Geometric) inkl. eigener Seite pro Muster | engine-dev + ui-dev | erledigt (Cross-Browser in AP12) | AP08 | 34 eigene Muster als Gradient-Ebenen; SVG-Fallback ohne foreignObject (< 1 % Pixel-Abweichung); Muster-Auswahl vorerst als Select; Worker +93 KiB gzip (Texte DE/EN liegen 3-fach im Bundle, in AP12 prüfen) |
| M2-AP04 | **CSS Pattern Editor** mit Ebenen | ui-dev + engine-dev | erledigt (Cross-Browser in AP12) | AP03 | Generisches Listen-Control (`kind: "list"`, Item-Locks, `listOp` mit Undo) und Thumbnail-Picker (`optionPreview`); 1 bis 5 Ebenen, alte Einzelmuster-Links per `migrateParams`; Teilen-Link mit 5 Ebenen 388 Zeichen; Leertaste würfelt alle Ebenen (Locks pro Feld und Ebene); Ziehen zum Umsortieren nicht umgesetzt |
| M2-AP05 | Farb-Tools **Palette Generator**, **Tints & Shades**, **Tailwind Palette** | engine-dev + ui-dev | erledigt (Cross-Browser in AP12) | – | Ohne Shell-Erweiterung: Farben als Einzel-Params (color1 bis color8), Schloss pro Farbe; Harmonie-Wechsel wirkt erst bei nächster Leertaste (UX in AP12 prüfen); Code-Exporte statt CSS |
| M2-AP06 | **Palette aus Bild** | engine-dev + ui-dev | erledigt (Cross-Browser in AP12) | AP05 | Generischer Bild-Eingang in der Shell (`imageInput` in der ToolDefinition, Worker, 5 MB, Magic Bytes); abgeleitete Farben nie im Teilen-Link; SVG wird im Haupt-Thread gerastert (kann > 50 ms dauern, in AP12 prüfen) |
| M2-AP07 | i18n: lokalisierte Slugs, hreflang, FR/IT vorbereitet | ui-dev | erledigt | – | Slugs zentral in `apps/web/i18n/slugs.ts` (Contract-Test), alte Pfade per 308; Basis-URL aus `NEXT_PUBLIC_SITE_URL`; x-default zeigt auf DE (in AP08 nochmals prüfen, ggf. EN) |
| M2-AP08 | SEO: Landing-Template je Tool, Katalog, Kategorien, Sitemap, JSON-LD, OG-Bilder | ui-dev | erledigt (Lighthouse in AP12) | AP07 | OG-Bilder beim Build (Worker 1.8 MiB gzip); x-default EN; noindex ausser Produktions-Host; echte SEO-Texte für M1-Tools; Editor-Seiten nicht in der Sitemap |
| M2-AP09 | Startseite, Impressum, Datenschutz, Analytics, Sentry | ui-dev | erledigt bis auf Lighthouse-Performance (AP12) | AP08 | Rechtstexte als Entwurf mit Banner und noindex, Platzhalter in `lib/legal/config.ts`, "juristisch zu prüfen"; Analytics und Sentry nur mit Repo-Variablen und nur in Production (deploy.yml); @sentry/browser 11.9.0 MIT, 19.8 KB gzip, erst beim ersten Fehler geladen; Locale-Cookie abgeschaltet (keine Cookies); Lighthouse mobil Performance 75 bis 87 (Ziel 95), Rest 100; csp.spec unter Volllast einmal instabil |
| M2-AP10 | **Founders-Warteliste** (Double Opt-in, Zähler) | backend-dev + security-reviewer | erledigt im Code, aus bis zum Owner-Setup; Security-Review bestanden mit Hinweisen (AP12) | – | Supabase und Resend per fetch; RLS ohne Policies, nur SECURITY-DEFINER-Funktionen; Migration und RLS mit PGlite getestet (Docker lief nicht, vor Deploy `supabase db reset`); aus ohne Secrets ("bald verfügbar"); Turnstile optional; Texte juristisch zu prüfen; Einrichtung: `docs/SETUP-WAITLIST.md`; AP12: Bestätigung nur per Knopf (POST), Rate-Limit je IPv6-/64, Body-Limit beim Streamen; offen für Andreas: Tagesbudget von 90 Mails kann aufgebraucht werden (Empfehlung: Turnstile in Produktion Pflicht plus WAF-Regel oder Tageslimit pro IP), Datenschutz-Satz zu Turnstile-Cookies |
| M2-AP11 | CSP und Security-Header | security-reviewer + ui-dev | erledigt; Security-Review bestanden (AP12: lokale Header nie hinter Cloudflare) | – | CSP erzwungen, aber `unsafe-inline` für Scripts (Next setzt pro Seite Inline-Scripts, Nonces würden statische Seiten verhindern); HSTS ohne preload; zod `jitless` gegen eval |
| M2-AP12 | Lighthouse ≥ 95, QA in 3 Browsern, Code- und Security-Review | qa-tester + reviewer | erledigt (SEO-Lighthouse erst auf Produktion) | alle | Domain, DNS, Search Console durch Andreas; Performance (Branch `m2/ap12-perf`): Lighthouse mobil gegen `next start`, Median aus 6 Läufen, vorher und nachher abwechselnd auf ruhiger Maschine. Performance vorher/nachher: `/de` 96/96, `/en` 96/96, `/de/punktmuster-generator` 98/98, `/en/polka-dot-pattern-generator` 98/98, `/de/tools` 94/96, `/de/tools/kategorie/muster` 98/99, `/de/css-muster/punkte` 97/95 (Streuung 89 bis 99, im Rauschen); Accessibility überall 100. SEO lokal 66 bis 69 nur wegen `X-Robots-Tag: noindex` ausserhalb des Produktions-Hosts (gewollt), alle übrigen SEO-Audits bestanden. Die früheren 75 bis 87 waren Messrauschen: Unter Last (Benchmark-Index unter 1100, parallele Builds) fallen dieselben Seiten auf 60 bis 85. Umgesetzt: Prefetch erst bei Absicht (Katalog ohne ein Dutzend RSC- und Editor-Chunk-Anfragen nach dem Laden), kein next-intl im Browser auf Landingpages (Layout ohne Provider, Links serverseitig aufgelöst; 43 KB roh, 13 KB gzip weniger JS; Startseite lädt ihn weiter für die Warteliste). SVG aus Bild: bleibt im Hauptthread (kein Browser rendert SVG im Worker; Pixel im Worker lesen brachte bei einem 1,2-MB-SVG nichts Messbares, verworfen), neuer E2E-Test mit Script im SVG. Harmonie wirkt sofort (`regenerateOn`). Firefox-Überlauf 375 px: Zoom-Zeile war 11 px zu breit, bricht jetzt um, E2E prüft die Zeile. Preset-Thumbnails sind seit AP08 Dateien. Worker 2003.6 KiB gzip; DE/EN-Texte liegen 2-fach im Worker (RSC- und SSR-Schicht), nicht weiter verfolgt. |

Reihenfolge: zuerst parallel Tool-Strang (AP01, AP02, AP05, AP06) und Seiten-Strang (AP07, dann AP08, dann AP03/AP04 und AP09); AP10 und AP11 parallel, sobald entschieden; zum Schluss AP12.

### M1: Editor-Shell + erste Tools (abgeschlossen)

| ID | Titel | Agent | Status | Abhängig von | Notiz |
|---|---|---|---|---|---|
| M1-AP01 | `ToolDefinition`-Typen, Registry, Test-Helfer (Schema-, Preset-, Snapshot-Tests generisch) | engine-dev | erledigt | – | Dep: zod 4 (ca. 27 KB gzip); 82 Tests |
| M1-AP02 | Editor-State: Params, Seed, Locks, Randomize, Undo/Redo, Varianten-Verlauf | ui-dev | erledigt | AP01 | Dep: zustand 5 (ca. 0.4 KB gzip); Preset erzeugt neue Variante; Locks und Filmstreifen nicht im Undo |
| M1-AP03 | Auto-Controls aus Zod-Schema (Slider, Segmented, Switch, Farbe, Palette) inkl. Schloss | ui-dev | erledigt | AP01 | Farbwähler ohne OKLCH-Tabs, Palette per Knöpfe statt Drag, Reset per Doppelklick (Tastatur folgt); 116 Tests |
| M1-AP04 | Editor-Seite `/[locale]/tools/[toolId]`: Layout, Presets-Leiste, Vorschau mit Zoom/Fit, Filmstreifen, Tastaturkürzel | ui-dev | erledigt | AP02, AP03 | EditorShell in editor-ui; Mobile einspaltig statt Bottom-Sheet; ⌘K, ⌘S, ⌘⇧C fehlen noch; Preset-Thumbnails als data-URL im HTML (Polka Dots ca. 34 KB gzip), in AP12 prüfen |
| M1-AP05 | Exporter SVG, CSS, PNG/JPG/WebP (freie Grösse, gross im Worker), Clipboard + Export-Dialog | engine-dev + ui-dev | erledigt | AP01, AP04 | `@motivo/exporters` (SVG, CSS, Raster im Worker, Clipboard), Extra-Exporte Tailwind und clip-path; ohne SVGO; iOS-Canvas-Limit ca. 16.7 MP |
| M1-AP06 | Teilen per URL-Hash (Params komprimiert) | ui-dev | erledigt | AP02 | Dep: fflate 0.8 (ca. 4.1 KB gzip); Format Version + DEFLATE + base64url, Limits 8 KB / 64 KB |
| M1-AP07 | Tool **CSS Gradient** (linear/radial/conic, Easing, OKLCH) | engine-dev | erledigt (Cross-Browser in AP12) | AP01 | Dep: culori 4 via `culori/fn` (ca. 1.3 KB gzip); Stopps gleichmässig, ziehbare Stopps später (neuer Control-Typ) |
| M1-AP08 | Tool **Blob** | engine-dev | erledigt (Cross-Browser in AP12) | AP01 | Füllung solid/outline/gradient; clip-path-CSS kommt mit AP05-Hook |
| M1-AP09 | Tool **SVG Waves** | engine-dev | erledigt (Cross-Browser in AP12) | AP01 | Param `coverage`, Standard 1920×1080 |
| M1-AP10 | Tool **Polka Dots** | engine-dev | erledigt (Cross-Browser in AP12) | AP01 | Abstand relativ zur kürzeren Kante; Params shape, colorMode, jitter |
| M1-AP11 | 6 **Konverter**-Seiten (SVG↔CSS, SVG↔Base64, Bild↔Base64) | ui-dev | erledigt (Security-Review in AP12) | – | Nutzer-SVG nur per `<img>` mit data-URI; Typ per Magic Bytes, 5 MB Limit, Web Worker; Sitemap/Changelog folgen in M2 |
| M1-AP12 | Snapshot-Tests je Preset, visueller Test Vorschau == PNG-Export in 3 Browsern | qa-tester | erledigt | AP05, AP07 bis AP10 | Vorschau == PNG je Tool in Chromium, Firefox, WebKit grün (Kantenglättung toleriert, echte Abweichung ≤ 0.02 %); axe, Tastatur, Hell/Dunkel, 375/768/1280 px geprüft |

Entscheide Orchestrator 2026-10-27: AP05 erhält einen Hook für Zusatz-Exporte pro Tool (Tailwind, clip-path); ziehbare Verlaufsstopps nach M1; i18n-Test in tool-registry liest `apps/web/messages` direkt (vorerst akzeptiert).

Reihenfolge: AP01, dann parallel Engine-Strang (AP07 bis AP10) und UI-Strang (AP02, AP03, dann AP04), danach AP05, AP06; AP11 jederzeit parallel; zum Schluss AP12 und Reviews (code-reviewer; security-reviewer für Konverter und URL-Hash).

Bewusst **nicht** in M1 (laut Roadmap später): Speichern/Accounts (M3), Export-Events in DB (M3), Gating/Wasserzeichen (M4), Brand-Paletten (M3).

### M0 (abgeschlossen)

| ID | Titel | Agent | Status | Abhängig von | Notiz |
|---|---|---|---|---|---|
| M0-AP01 | Monorepo-Grundgerüst: pnpm-Workspaces, Turborepo, `packages/config` (tsconfig strict, ESLint, Prettier), leere Pakete gemäss ARCHITECTURE.md 3 | Orchestrator | erledigt | – | Basis für alles |
| M0-AP02 | `apps/web`: Next.js (App Router), TypeScript strict, Tailwind, shadcn/ui | ui-dev | erledigt | AP01 | Versionen per offizieller Doku prüfen |
| M0-AP03 | Lint-Regel "kein `Math.random`/`Date.now` in engine/effects/shaders", Husky + lint-staged | Orchestrator | erledigt | AP01 | |
| M0-AP04 | Vitest + Playwright einrichten, GitHub Actions (lint, typecheck, test, build) | qa-tester | erledigt | AP01, AP02 | |
| M0-AP05 | Design-Tokens Light/Dark, Basis-Layout, Theme-Switch (⌘⇧K), i18n-Grundgerüst DE/EN | ui-dev | erledigt | AP02 | Texte nur über i18n-Keys |
| M0-AP06 | `packages/engine`: PRNG `mulberry32`, Vektor-Helfer, Catmull-Rom zu Bezier, Poisson-Disk, je mit Unit-Tests | engine-dev | erledigt | AP01 | parallel zu AP02 bis AP05 |
| M0-AP07 | Deployment: Cloudflare Workers via OpenNext, Preview pro Branch, Production auf `main` | Orchestrator | erledigt | AP02, AP04 | Konfiguration fertig und lokal in workerd getestet; Workers Builds am 2026-10-27 verbunden (Projekt `motivo-web`, Path `apps/web`, Build `pnpm cf:build`, NODE_VERSION 22). Erster Production-Build scheiterte, weil `main` noch keine App enthält. workers.dev und Preview URLs im Dashboard aktiviert; Git-Verbindung nach Clone-Fehlern neu verbunden (Token `motivo`); Workers Builds scheitert ab ca. 07:15 UTC dauerhaft beim Klonen. Plan B (Entscheid Andreas): Deploy über GitHub Actions (`.github/workflows/deploy.yml`), Secrets `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID`; Preview-URL-Muster `<branch>-motivo-web.andreas-65d.workers.dev` |

Reihenfolge: AP01, dann parallel AP06 (engine) und AP02 (web), danach AP03, AP04, AP05, zum Schluss AP07. Quality Gates je AP: lint/typecheck/test, code-reviewer.

## Blocker und offene Fragen an Andreas

- Offen (niedrig, aus Code-Review M0): Sprachwechsel übernimmt Query/Hash nicht (relevant ab Editor-URLs in M1). Inline-Theme-Script braucht Nonce/Hash, sobald CSP kommt. Firefox öffnet evtl. Konsole bei Ctrl+Shift+K.

## Kostenentscheide (Lifetime-Ökonomie)

| Datum | Feature | Laufende Kosten (Schätzung) | Lösung (clientseitig / Credits / Fair Use) |
|---|---|---|---|
| 2026-10-27 | Founders-Warteliste (M2-AP10) | 0 CHF: Supabase Free (500 MB), Resend Free (100 Mails/Tag, 3000/Monat), Turnstile gratis | Höchstens 90 Bestätigungsmails pro Tag, 5 pro Adresse, 10 Anfragen pro Stunde und IP-Hash; Supabase Free pausiert nach 7 Tagen ohne Aktivität (Owner prüfen) |

## Werkzeug-Status

| Werkzeug | Verfügbar? | Notiz |
|---|---|---|
| Supabase MCP/CLI | MCP ja (Cloud) | CLI nicht geprüft |
| Vercel MCP/CLI | MCP ja (Cloud) | nicht mehr benötigt (Hosting Cloudflare) |
| Cloudflare | wrangler lokal ja | Cloudflare-API aus der Cloud-Sitzung blockiert; Deploy über Workers Builds |
| Stripe CLI | nein | Fallback: Fixtures mit signierten Test-Events (erst ab M4 nötig) |
| Playwright | ja (Cloud-Container) | Chromium vorinstalliert |
| shadcnspace MCP | nein | Fallback: shadcn/ui + Tailwind |
| Impeccable | nein | Fallback: DESIGN.md manuell prüfen |
| GitHub-Repo | ja | `afischZH/motivo` (privat), seit 2026-10-27 Quelle der Wahrheit |
| pnpm | nein (auf dem verbundenen Rechner nicht gefunden) | wird in M0 installiert |

## Sitzungsprotokoll

### 2026-10-27
- Erledigt: Sitzungsstart-Ritual. CLAUDE.md, ROADMAP.md, PROGRESS.md gelesen. Kein Git-Repo, noch kein Code, daher Lint/Tests entfallen.
- Entscheide: keine.
- Repo `afischZH/motivo` angelegt (durch Andreas), Docs als erster Commit gepusht. M0-AP-Plan erstellt.
- M0 freigegeben (Hosting Cloudflare). AP01 bis AP06 umgesetzt, CI grün (Chromium, Firefox, WebKit). PR #1.
- Entscheide: TypeScript 6.0.x gepinnt; Turbopack statt webpack (engine-Imports ohne `.js`); next-intl 4 mit `/de` und `/en`; Theme ohne next-themes (Inline-Script).
- Plan B: Deploy über GitHub Actions; Preview und Production live. M0 abgenommen, PR #1 gemergt.
- Nächster Schritt: M1-AP-Plan freigeben.
